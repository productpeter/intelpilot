import cron from 'node-cron';
import config from '../config/index.js';
import { runFullScan } from '../services/scanner.js';

export function startCronJobs() {
  cron.schedule(config.cron.scan, async () => {
    console.log('[Cron] Starting daily scan (scan → enrich → report)…');
    try {
      await runFullScan();
    } catch (err) {
      console.error('[Cron] Scan pipeline failed:', err.message);
    }
  });

  console.log(`[Cron] Daily scan schedule: ${config.cron.scan}`);
}
