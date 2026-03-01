import axios from 'axios';
import config from '../config/index.js';

const client = axios.create({
  baseURL: config.tabstack.baseUrl,
  headers: {
    Authorization: `Bearer ${config.tabstack.apiKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 120_000,
});

export async function extractJson(url, jsonSchema, options = {}) {
  const { data } = await client.post('/v1/extract/json', {
    url,
    json_schema: jsonSchema,
    nocache: options.nocache ?? false,
    ...(options.geoTarget && { geo_target: options.geoTarget }),
  });
  return data;
}

export async function extractMarkdown(url, options = {}) {
  const { data } = await client.post('/v1/extract/markdown', {
    url,
    nocache: options.nocache ?? false,
  });
  return data;
}

export async function research(query, mode = 'fast') {
  const url = `${config.tabstack.baseUrl}/v1/research`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.tabstack.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, mode }),
  });

  if (!response.ok) {
    throw new Error(`Tabstack research failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let report = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLine = event.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      try {
        const payload = JSON.parse(dataLine.slice(5).trim());
        if (payload.report) report = payload.report;
        if (payload.finalAnswer) report = payload.finalAnswer;
        if (payload.result?.finalAnswer) report = payload.result.finalAnswer;
      } catch {
        // non-JSON data, skip
      }
    }
  }

  if (!report) {
    throw new Error('Tabstack research returned no report');
  }

  return report;
}
