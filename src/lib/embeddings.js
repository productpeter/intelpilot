import axios from 'axios';
import config from '../config/index.js';

const client = axios.create({
  baseURL: 'https://api.openai.com/v1',
  headers: {
    Authorization: `Bearer ${config.openai.apiKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
});

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2_000;

export async function getEmbedding(text) {
  let lastErr;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { data } = await client.post('/embeddings', {
        model: config.openai.embeddingModel,
        input: text,
        dimensions: config.openai.embeddingDim,
      });
      return data.data[0].embedding;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;

      if (status === 429 || status >= 500) {
        const retryAfter = parseInt(err.response?.headers?.['retry-after'], 10);
        const delay = retryAfter
          ? retryAfter * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[Embeddings] ${status} on attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${delay}ms…`,
        );
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  throw lastErr;
}

export function buildEntityEmbeddingText(entity) {
  const parts = [`Name: ${entity.name}`];
  if (entity.canonical_domain) parts.push(`Domain: ${entity.canonical_domain}`);
  if (entity.description) parts.push(`Description: ${entity.description}`);
  if (entity.tags?.length) parts.push(`Tags: ${entity.tags.join(', ')}`);
  return parts.join(' | ');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
