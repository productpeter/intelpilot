import { Router } from 'express';
import { col } from '../db/mongo.js';

const router = Router();

router.get('/latest', async (req, res) => {
  const report = await col('reports').findOne({}, { sort: { generated_at: -1 } });

  if (!report) {
    return res.status(404).json({ error: 'No reports generated yet' });
  }

  if (req.query.format === 'html') {
    return res.type('html').send(report.report_html);
  }

  res.json({
    report_json: report.report_json,
    report_html: report.report_html,
    generated_at: report.generated_at,
    stats: report.stats,
  });
});

router.get('/', async (req, res) => {
  const reports = await col('reports')
    .find({}, { projection: { report_html: 0, report_json: 0 } })
    .sort({ generated_at: -1 })
    .limit(20)
    .toArray();

  res.json(reports);
});

export default router;
