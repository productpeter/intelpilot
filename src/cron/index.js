import cron from 'node-cron';
import config from '../config/index.js';
import { runFullScan } from '../services/scanner.js';
import { generateWeeklyReport } from '../services/reports.js';

export function startCronJobs() {
  cron.schedule(config.cron.scan, async () => {
    console.log('[Cron] Starting scheduled scan…');
    try {
      await runFullScan();
    } catch (err) {
      console.error('[Cron] Scan failed:', err.message);
    }
  });

  cron.schedule(config.cron.weeklyReport, async () => {
    console.log('[Cron] Generating weekly report…');
    try {
      await generateWeeklyReport();
    } catch (err) {
      console.error('[Cron] Report generation failed:', err.message);
    }
  });

  console.log(`[Cron] Scan schedule: ${config.cron.scan}`);
  console.log(`[Cron] Report schedule: ${config.cron.weeklyReport}`);
}
