import { Router } from 'express';
import { getDb } from '../db/mongo.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    await db.command({ ping: 1 });
    res.json({ status: 'ok', uptime: process.uptime(), db: 'connected', scan_cron: process.env.SCAN_CRON || '(default)' });
  } catch {
    res.status(503).json({ status: 'degraded', uptime: process.uptime(), db: 'disconnected' });
  }
});

export default router;
