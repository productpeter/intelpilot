import 'dotenv/config';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  adminToken: process.env.ADMIN_TOKEN || 'change_me',

  mongo: {
    uri: process.env.MONGODB_URI,
    db: process.env.MONGODB_DB || 'intelpilot',
  },

  tabstack: {
    apiKey: process.env.TABSTACK_API_KEY,
    baseUrl: process.env.TABSTACK_BASE_URL || 'https://api.tabstack.ai',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
    embeddingDim: parseInt(process.env.OPENAI_EMBEDDING_DIM, 10) || 3072,
  },

  r2: {
    bucket: process.env.R2_BUCKET || 'intelpilot-snapshots',
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    endpoint: process.env.R2_ENDPOINT,
    region: process.env.R2_REGION || 'auto',
  },

  cron: {
    scan: process.env.SCAN_CRON || '0 8 * * *',
  },
};

export default config;
