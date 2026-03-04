import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { runFullScan } from '../services/scanner.js';
import { generateWeeklyReport } from '../services/reports.js';
import { enrichEntities } from '../services/enricher.js';
import { col } from '../db/mongo.js';
import { getAllJobs } from '../services/progress.js';

const router = Router();

router.get('/scan/status', async (req, res) => {
  const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);
  await col('scan_runs').updateMany(
    { status: 'running', started_at: { $lt: staleThreshold } },
    { $set: { status: 'fail', finished_at: new Date() } },
  );

  const runs = await col('scan_runs')
    .find({})
    .sort({ started_at: -1 })
    .limit(20)
    .toArray();

  const running = runs.filter((r) => r.status === 'running');
  const latest = runs[0] || null;

  const activeCounts = running.reduce(
    (acc, r) => {
      acc.candidates += r.counts?.candidates_found || 0;
      acc.success += r.counts?.extracted_success || 0;
      acc.fail += r.counts?.extracted_fail || 0;
      return acc;
    },
    { candidates: 0, success: 0, fail: 0 },
  );

  const latestBatch = latest?.started_at
    ? runs.filter((r) => Math.abs(new Date(r.started_at) - new Date(latest.started_at)) < 5000)
    : [];
  const batchCounts = latestBatch.reduce(
    (acc, r) => {
      acc.candidates += r.counts?.candidates_found || 0;
      acc.success += r.counts?.extracted_success || 0;
      acc.fail += r.counts?.extracted_fail || 0;
      return acc;
    },
    { candidates: 0, success: 0, fail: 0 },
  );

  res.json({
    is_running: running.length > 0,
    running_count: running.length,
    latest,
    recent_runs: runs.slice(0, 10),
    counts: running.length > 0 ? activeCounts : batchCounts,
  });
});

router.get('/jobs', (req, res) => {
  res.json(getAllJobs());
});

router.use(adminAuth);

router.post('/scan/run', async (req, res) => {
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

export default router;
