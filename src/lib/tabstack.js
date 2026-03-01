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
