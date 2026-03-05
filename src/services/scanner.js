import { col } from '../db/mongo.js';
import { getAllSources } from '../sources/index.js';
import { processDiscovery, isValidProductUrl } from './extractor.js';
import { enrichEntities } from './enricher.js';
import { generateWeeklyReport } from './reports.js';
import { betterName } from '../lib/namefix.js';

const EXTRACTION_CONCURRENCY = 10;
const SOURCE_TIMEOUT_MS = 10 * 60 * 1000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

export async function runFullScan() {
  console.log('[Scanner] Starting full scan (concurrent)…');
  const sources = getAllSources();

  const settled = await Promise.allSettled(
    sources.map((source) =>
      withTimeout(runSourceScan(source), SOURCE_TIMEOUT_MS, source.name),
    ),
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

  const missingUrlEntities = await col('entities')
    .find({
      'classification.is_startup': true,
      'enrichment.metrics.website': { $ne: null },
      $or: [{ website_url: null }, { website_url: '' }, { website_url: { $exists: false } }],
    })
    .project({ name: 1, website_url: 1, 'enrichment.metrics.website': 1 })
    .toArray();

  let urlsFixed = 0;
  for (const e of missingUrlEntities) {
    let url = e.enrichment.metrics.website;
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (url && isValidProductUrl(url)) {
      await col('entities').updateOne({ _id: e._id }, { $set: { website_url: url } });
      console.log(`[Scanner] Fixed URL for "${e.name}": → ${url}`);
      urlsFixed++;
    }
  }
  if (urlsFixed) console.log(`[Scanner] Fixed ${urlsFixed} missing URLs`);

  const recentlyEnriched = await col('entities')
    .find({
      'classification.is_startup': true,
      'enrichment.metrics.matched_name': { $ne: null },
      'enrichment.enriched_at': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    })
    .project({ name: 1, website_url: 1, classification: 1, 'enrichment.metrics.matched_name': 1 })
    .toArray();

  let namesFixed = 0;
  for (const e of recentlyEnriched) {
    const matched = (e.enrichment.metrics.matched_name || '').trim();
    const fixed = betterName(e.name, e.classification?.clean_name, matched, e.website_url);
    if (!fixed) continue;
    await col('entities').updateOne({ _id: e._id }, { $set: { name: fixed, 'classification.clean_name': fixed } });
    console.log(`[Scanner] Fixed name: "${e.name}" → "${fixed}"`);
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
    counts: { candidates_found: 0, new_candidates: 0, extracted_success: 0, extracted_fail: 0 },
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
    scanRun.counts.new_candidates = newCandidates.length;
    await col('scan_runs').updateOne(
      { _id: scanRunId },
      { $set: { counts: scanRun.counts } },
    );

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
