import { col } from '../db/mongo.js';
import { getAllSources } from '../sources/index.js';
import { processDiscovery } from './extractor.js';
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
