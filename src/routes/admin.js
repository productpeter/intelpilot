import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { runFullScan } from '../services/scanner.js';
import { generateWeeklyReport } from '../services/reports.js';

const router = Router();

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

export default router;
