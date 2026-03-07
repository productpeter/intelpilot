import 'dotenv/config';
import app from './app.js';
import config from './config/index.js';
import { connectDb } from './db/mongo.js';
import { startCronJobs } from './cron/index.js';

async function main() {
  await connectDb();
  startCronJobs();

  app.listen(config.port, () => {
    console.log(`IntelPilot running on http://localhost:${config.port}`);
    console.log(`Environment: ${config.env}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
