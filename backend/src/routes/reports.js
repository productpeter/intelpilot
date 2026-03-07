import { Router } from 'express';
import { col } from '../db/mongo.js';

const router = Router();

router.get('/latest', async (req, res) => {
  const wantsHtml = req.query.format === 'html' || req.accepts('html') === 'html';

  if (wantsHtml) {
    const report = await col('reports').findOne({}, { sort: { generated_at: -1 } });
    if (!report) return res.status(404).json({ error: 'No reports generated yet' });
    return res.type('html').send(report.report_html);
  }

  const full = req.query.full === 'true';
  const projection = full ? {} : { report_html: 0, report_json: 0 };
  const report = await col('reports').findOne(
    {},
    { sort: { generated_at: -1 }, projection },
  );

  if (!report) {
    return res.status(404).json({ error: 'No reports generated yet' });
  }

  res.json(report);
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
