import axios from 'axios';
import config from '../config/index.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2_000;

const client = axios.create({
  baseURL: 'https://api.openai.com/v1',
  headers: {
    Authorization: `Bearer ${config.openai.apiKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
});

export async function chatStream(messages, options = {}) {
  const model = options.model || 'gpt-4o-mini';
  const { data: stream } = await client.post(
    '/chat/completions',
    {
      model,
      messages,
      temperature: options.temperature ?? 0.3,
      stream: true,
    },
    { responseType: 'stream', timeout: 120_000 },
  );
  return stream;
}

export async function chatJson(systemPrompt, userContent, options = {}) {
  const model = options.model || 'gpt-4o-mini';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await client.post('/chat/completions', {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: options.temperature ?? 0.1,
        response_format: { type: 'json_object' },
      });

      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('Empty response from OpenAI');
      return JSON.parse(text);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[OpenAI] ${status} on attempt ${attempt + 1}, retrying in ${delay}ms…`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      throw err;
    }
  }
}
