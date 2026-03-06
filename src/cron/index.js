import cron from 'node-cron';
import config from '../config/index.js';
import { runFullScan } from '../services/scanner.js';
import { getAllJobs } from '../services/progress.js';

let scanRunning = false;

export function startCronJobs() {
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log(`[Cron] Container timezone: ${tz}, forcing UTC for schedule`);

  cron.schedule(
    config.cron.scan,
    async () => {
      if (scanRunning || getAllJobs().scan?.status === 'running') {
        console.log(`[Cron] Skipping — scan already in progress`);
        return;
      }
      scanRunning = true;
      console.log(`[Cron] Fired at ${new Date().toISOString()} — starting scan…`);
      try {
        await runFullScan();
      } catch (err) {
        console.error('[Cron] Scan pipeline failed:', err.message);
      } finally {
        scanRunning = false;
      }
    },
    { timezone: 'UTC' },
  );

  console.log(`[Cron] Scan schedule: ${config.cron.scan} (UTC)`);
}
