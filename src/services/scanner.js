import { col } from '../db/mongo.js';
import { getAllSources } from '../sources/index.js';
import { processDiscovery, isValidProductUrl } from './extractor.js';
import { enrichEntities } from './enricher.js';
import { generateWeeklyReport } from './reports.js';

const EXTRACTION_CONCURRENCY = 10;

export async function runFullScan() {
  console.log('[Scanner] Starting full scan (concurrent)…');
  const sources = getAllSources();

  const settled = await Promise.allSettled(
    sources.map((source) => runSourceScan(source)),
  );

  const results = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { source: sources[i].name, error: r.reason?.message },
  );

  console.log('[Scanner] Full scan complete');

  triggerPostScanPipeline().catch((err) =>
    console.error('[Scanner] Post-scan pipeline error:', err.message),
  );

  return results;
}

async function triggerPostScanPipeline() {
  const unenriched = await col('entities')
    .find({ 'classification.is_startup': true, enrichment: { $exists: false } })
    .sort({ updated_at: -1 })
    .limit(30)
    .toArray();

  if (unenriched.length) {
    console.log(`[Scanner] Auto-enriching ${unenriched.length} entities…`);
    await enrichEntities(unenriched);
  } else {
    console.log('[Scanner] No unenriched entities after scan');
  }

  const badUrlEntities = await col('entities')
    .find({
      'classification.is_startup': true,
      'enrichment': { $exists: true },
      'enrichment.metrics.website': { $ne: null },
    })
    .toArray();

  const needsReenrich = badUrlEntities.filter((e) => {
    const current = e.website_url;
    if (!current) return true;
    return !isValidProductUrl(current);
  });

  if (needsReenrich.length) {
    console.log(`[Scanner] Re-enriching ${needsReenrich.length} entities with bad URLs…`);
    for (const e of needsReenrich) {
      let url = e.enrichment.metrics.website;
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (url && isValidProductUrl(url)) {
        await col('entities').updateOne({ _id: e._id }, { $set: { website_url: url } });
        console.log(`[Scanner] Fixed URL for "${e.name}": ${e.website_url} → ${url}`);
      }
    }
  }

  const genericNames = await col('entities')
    .find({
      'classification.is_startup': true,
      'enrichment.metrics.matched_name': { $ne: null },
    })
    .toArray();

  let namesFixed = 0;
  for (const e of genericNames) {
    const researchName = (e.enrichment.metrics.matched_name || '').trim();
    if (!researchName || researchName.length > 40 || researchName.split(/\s+/).length > 5) continue;
    const currentName = e.name || '';
    const currentClean = e.classification?.clean_name || '';
    const isGeneric = /^(AI |An AI |The )/i.test(currentName) || currentName.length > 30;
    const isGenericClean = /^(AI |An AI |The )/i.test(currentClean) || currentClean.length > 30;
    if (!isGeneric && !isGenericClean) continue;
    const updates = {};
    if (isGeneric) updates.name = researchName;
    if (isGenericClean) updates['classification.clean_name'] = researchName;
    await col('entities').updateOne({ _id: e._id }, { $set: updates });
    console.log(`[Scanner] Fixed name: "${currentName}" → "${researchName}"`);
    namesFixed++;
  }
  if (namesFixed) console.log(`[Scanner] Fixed ${namesFixed} generic entity names`);

  console.log('[Scanner] Auto-generating report…');
  try {
    const report = await generateWeeklyReport();
    console.log(`[Scanner] Report generated: ${report.items?.length || 0} items`);
  } catch (err) {
    console.error('[Scanner] Auto-report generation failed:', err.message);
  }
}

export async function runSourceScan(source) {
  const sourceDoc = await col('sources').findOneAndUpdate(
    { name: source.name },
    {
      $set: { name: source.name, type: source.type, enabled: true },
      $setOnInsert: { config: {} },
    },
    { upsert: true, returnDocument: 'after' },
  );

  const scanRun = {
    source_id: sourceDoc._id,
    started_at: new Date(),
    status: 'running',
    counts: { candidates_found: 0, extracted_success: 0, extracted_fail: 0 },
  };
  const { insertedId: scanRunId } = await col('scan_runs').insertOne(scanRun);

  try {
    const candidates = await source.fetchCandidates();
    scanRun.counts.candidates_found = candidates.length;
    console.log(`[Scanner] ${source.name}: found ${candidates.length} candidates`);

    const newCandidates = [];
    for (const candidate of candidates) {
      const existing = await col('discoveries').findOne({
        candidate_url: candidate.url,
      });
      if (!existing) newCandidates.push(candidate);
    }

    const chunks = [];
    for (let i = 0; i < newCandidates.length; i += EXTRACTION_CONCURRENCY) {
      chunks.push(newCandidates.slice(i, i + EXTRACTION_CONCURRENCY));
    }

    for (const chunk of chunks) {
      await Promise.allSettled(
        chunk.map(async (candidate) => {
          const discovery = {
            source_id: sourceDoc._id,
            candidate_url: candidate.url,
            title: candidate.title,
            meta: candidate.meta || {},
            discovered_at: new Date(),
            status: 'queued',
            entity_id: null,
          };
          const { insertedId: discoveryId } = await col('discoveries').insertOne(discovery);

          try {
            await processDiscovery({ ...discovery, _id: discoveryId }, sourceDoc);
            await col('discoveries').updateOne(
              { _id: discoveryId },
              { $set: { status: 'extracted' } },
            );
            scanRun.counts.extracted_success++;
          } catch (err) {
            console.error(`[Scanner] Extraction failed for ${candidate.url}:`, err.message);
            await col('discoveries').updateOne(
              { _id: discoveryId },
              { $set: { status: 'failed' } },
            );
            scanRun.counts.extracted_fail++;
          }
          await col('scan_runs').updateOne(
            { _id: scanRunId },
            { $set: { counts: scanRun.counts } },
          );
        }),
      );
    }

    scanRun.status = 'success';
  } catch (err) {
    scanRun.status = 'fail';
    console.error(`[Scanner] Scan run failed for ${source.name}:`, err.message);
  }

  scanRun.finished_at = new Date();
  await col('scan_runs').updateOne({ _id: scanRunId }, { $set: scanRun });

  return { source: source.name, ...scanRun.counts, status: scanRun.status };
}
