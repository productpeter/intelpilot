import cron from 'node-cron';
import config from '../config/index.js';
import { runFullScan } from '../services/scanner.js';

export function startCronJobs() {
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log(`[Cron] Container timezone: ${tz}, forcing UTC for schedule`);

  cron.schedule(
    config.cron.scan,
    async () => {
      console.log(`[Cron] Fired at ${new Date().toISOString()} — starting daily scan…`);
      try {
        await runFullScan();
      } catch (err) {
        console.error('[Cron] Scan pipeline failed:', err.message);
      }
    },
    { timezone: 'UTC' },
  );

  console.log(`[Cron] Daily scan schedule: ${config.cron.scan} (UTC)`);
}
