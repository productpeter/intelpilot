import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { runFullScan } from '../services/scanner.js';
import { generateWeeklyReport } from '../services/reports.js';
import { enrichEntities } from '../services/enricher.js';
import { col } from '../db/mongo.js';
import { getAllJobs } from '../services/progress.js';
import { betterName } from '../lib/namefix.js';

const router = Router();

router.get('/scan/status', async (req, res) => {
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
  await col('scan_runs').updateMany(
    {
      status: 'running',
      $or: [
        { started_at: { $lt: staleThreshold } },
        { started_at: { $lt: staleThreshold.toISOString() } },
      ],
    },
    { $set: { status: 'fail', finished_at: new Date() } },
  );

  const runs = await col('scan_runs')
    .find({})
    .sort({ started_at: -1 })
    .limit(20)
    .toArray();

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
    recent_runs: runs.slice(0, 10),
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
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ua = req.headers['user-agent'] || 'none';
  const ref = req.headers['referer'] || req.headers['origin'] || 'none';

  const lastTrigger = await col('scan_triggers').findOne({}, { sort: { triggered_at: -1 } });
  const cooldown = 15 * 60 * 1000;
  if (lastTrigger && Date.now() - new Date(lastTrigger.triggered_at).getTime() < cooldown) {
    const mins = Math.ceil((cooldown - (Date.now() - new Date(lastTrigger.triggered_at).getTime())) / 60000);
    return res.status(429).json({ error: `Scan cooldown — try again in ${mins} min` });
  }

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

export default router;
