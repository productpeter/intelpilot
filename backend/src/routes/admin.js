import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { adminAuth } from '../middleware/auth.js';
import { runFullScan } from '../services/scanner.js';
import { generateWeeklyReport } from '../services/reports.js';
import { enrichEntities } from '../services/enricher.js';
import { col } from '../db/mongo.js';
import { getAllJobs } from '../services/progress.js';
import { betterName } from '../lib/namefix.js';

const router = Router();

router.get('/scan/status', async (req, res) => {
  const staleThreshold = new Date(Date.now() - 25 * 60 * 1000);
  await col('scan_runs').updateMany(
    { status: 'running', started_at: { $lt: staleThreshold } },
    { $set: { status: 'fail', finished_at: new Date() } },
  );

  const runs = await col('scan_runs')
    .find({})
    .sort({ started_at: -1 })
    .limit(20)
    .toArray();

  const sourceIds = [...new Set(runs.map((r) => r.source_id))];
  const sources = await col('sources')
    .find({ _id: { $in: sourceIds } })
    .project({ name: 1 })
    .toArray();
  const sourceMap = Object.fromEntries(sources.map((s) => [String(s._id), s.name]));

  for (const r of runs) {
    r.source_name = sourceMap[String(r.source_id)] || 'unknown';
  }

  const running = runs.filter((r) => r.status === 'running');
  const latest = runs[0] || null;

  const latestBatch = latest?.started_at
    ? runs.filter((r) => Math.abs(new Date(r.started_at) - new Date(latest.started_at)) < 5000)
    : [];
  const batchCounts = latestBatch.reduce(
    (acc, r) => {
      acc.candidates += r.counts?.candidates_found || 0;
      acc.new_candidates += r.counts?.new_candidates || 0;
      acc.success += r.counts?.extracted_success || 0;
      acc.fail += r.counts?.extracted_fail || 0;
      return acc;
    },
    { candidates: 0, new_candidates: 0, success: 0, fail: 0 },
  );

  res.json({
    is_running: running.length > 0,
    running_count: running.length,
    latest,
    recent_runs: runs,
    counts: batchCounts,
  });
});

router.get('/jobs', (req, res) => {
  res.json(getAllJobs());
});

router.get('/scan/triggers', async (req, res) => {
  const triggers = await col('scan_triggers').find({}).sort({ triggered_at: -1 }).limit(20).toArray();
  res.json(triggers);
});

router.use(adminAuth);

router.post('/scan/run', async (req, res) => {
  const jobs = getAllJobs();
  if (jobs.scan?.status === 'running') {
    return res.status(409).json({ error: 'A scan is already running' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ua = req.headers['user-agent'] || 'none';
  const ref = req.headers['referer'] || req.headers['origin'] || 'none';

  await col('scan_triggers').insertOne({ triggered_at: new Date(), ip, user_agent: ua, referer: ref });
  console.log(`[Admin] Scan triggered — ip=${ip} ua=${ua} referer=${ref}`);
  res.json({ message: 'Scan started', status: 'running' });
  runFullScan().catch((err) => console.error('[Admin] Scan error:', err));
});

router.post('/report/generate', async (req, res) => {
  try {
    const report = await generateWeeklyReport();
    res.json({
      message: 'Report generated',
      report_id: report._id,
      items_count: report.items?.length || 0,
      generated_at: report.generated_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/enrich', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 15;
    const entities = await col('entities')
      .find({ 'classification.is_startup': true, enrichment: { $exists: false } })
      .sort({ updated_at: -1 })
      .limit(limit)
      .toArray();

    if (!entities.length) {
      return res.json({ message: 'No entities to enrich', count: 0 });
    }

    res.json({ message: 'Enrichment started', count: entities.length });
    enrichEntities(entities).catch((err) =>
      console.error('[Admin] Enrichment error:', err),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/re-enrich', async (req, res) => {
  const jobs = getAllJobs();
  if (jobs['re-enrich']?.status === 'running') {
    return res.status(409).json({ error: 'Re-enrichment is already running' });
  }

  try {
    const entities = await col('entities')
      .find({ 'classification.is_startup': true })
      .sort({ updated_at: -1 })
      .toArray();

    if (!entities.length) {
      return res.json({ message: 'No startup entities found', count: 0 });
    }

    await col('entities').updateMany(
      { _id: { $in: entities.map((e) => e._id) } },
      { $unset: { enrichment: '' } },
    );

    res.json({ message: `Re-enrichment started for ${entities.length} entities`, count: entities.length });
    enrichEntities(entities, 're-enrich').catch((err) =>
      console.error('[Admin] Re-enrichment error:', err),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/fix-urls', async (req, res) => {
  try {
    const entities = await col('entities')
      .find({
        'classification.is_startup': true,
        'enrichment.metrics.website': { $ne: null },
      })
      .toArray();

    let fixed = 0;
    for (const e of entities) {
      let enrichedUrl = e.enrichment.metrics.website;
      if (enrichedUrl && !/^https?:\/\//i.test(enrichedUrl)) {
        if (/^\//.test(enrichedUrl) || !enrichedUrl.includes('.')) continue;
        enrichedUrl = `https://${enrichedUrl}`;
      }
      if (!enrichedUrl) continue;

      const current = e.website_url;
      if (current === enrichedUrl) continue;

      try { new URL(enrichedUrl); } catch { continue; }

      await col('entities').updateOne(
        { _id: e._id },
        { $set: { website_url: enrichedUrl } },
      );
      console.log(`[FixURLs] ${e.name}: ${current} → ${enrichedUrl}`);
      fixed++;
    }

    let namesFixed = 0;
    const allEnriched = await col('entities')
      .find({
        'classification.is_startup': true,
        'enrichment.metrics.matched_name': { $ne: null },
      })
      .toArray();

    for (const e of allEnriched) {
      const matched = (e.enrichment.metrics.matched_name || '').trim();
      const fixed = betterName(e.name, e.classification?.clean_name, matched, e.website_url);
      if (!fixed) continue;

      const updates = { name: fixed, 'classification.clean_name': fixed };
      await col('entities').updateOne({ _id: e._id }, { $set: updates });
      console.log(`[FixNames] "${e.name}" → "${fixed}"`);
      namesFixed++;
    }

    res.json({ message: `Fixed ${fixed} URLs, ${namesFixed} names`, fixed, namesFixed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/reports/empty', async (req, res) => {
  const result = await col('reports').deleteMany({
    $or: [{ items: { $size: 0 } }, { items: { $exists: false } }],
  });
  res.json({ deleted: result.deletedCount });
});

router.delete('/entities', async (req, res) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'Provide { ids: [...] } array of entity _id strings' });
    }
    const { ObjectId } = await import('mongodb');
    const objectIds = ids.map((id) => new ObjectId(id));
    await col('signals').deleteMany({ entity_id: { $in: objectIds } });
    await col('evidence').deleteMany({ entity_id: { $in: objectIds } });
    const result = await col('entities').deleteMany({ _id: { $in: objectIds } });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/scan/cleanup', async (req, res) => {
  const result = await col('scan_runs').updateMany(
    { status: 'running' },
    { $set: { status: 'fail', finished_at: new Date() } },
  );
  res.json({ cleaned: result.modifiedCount });
});

router.delete('/wipe', async (req, res) => {
  try {
    const collections = ['entities', 'signals', 'evidence', 'discoveries', 'scan_runs', 'raw_pages', 'reports'];
    const results = {};
    for (const name of collections) {
      const r = await col(name).deleteMany({});
      results[name] = r.deletedCount;
    }
    res.json({ wiped: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/scan/purge-batch', async (req, res) => {
  try {
    const { after, before } = req.body || {};
    if (!after || !before) {
      return res.status(400).json({ error: 'Provide { after: "ISO date", before: "ISO date" }' });
    }
    const range = { $gte: new Date(after), $lte: new Date(before) };

    const runs = await col('scan_runs').deleteMany({ started_at: range });
    const discoveries = await col('discoveries').deleteMany({ discovered_at: range });
    const rawPages = await col('raw_pages').deleteMany({ fetched_at: range });

    res.json({
      scan_runs: runs.deletedCount,
      discoveries: discoveries.deletedCount,
      raw_pages: rawPages.deletedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
