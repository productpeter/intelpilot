import { extractJson } from '../lib/tabstack.js';

const BETALIST_URLS = [
  'https://betalist.com/startups',
  'https://betalist.com/markets/artificial-intelligence',
  'https://betalist.com/markets/saas',
];

const SCHEMA = {
  type: 'object',
  properties: {
    startups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Startup name' },
          tagline: { type: 'string', description: 'One-line description' },
          url: { type: 'string', description: 'URL to the BetaList page or external site' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Category tags (e.g. AI, SaaS, Productivity)',
          },
        },
        required: ['name'],
      },
    },
  },
  required: ['startups'],
};

export default {
  name: 'betalist',
  type: 'html',

  async fetchCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const pageUrl of BETALIST_URLS) {
      try {
        const result = await extractJson(pageUrl, SCHEMA, { nocache: true });
        for (const s of result.startups || []) {
          let url = s.url || '';
          if (url && !url.startsWith('http')) {
            url = `https://betalist.com${url.startsWith('/') ? '' : '/'}${url}`;
          }
          const finalUrl = url || 'https://betalist.com/startups';
          if (seen.has(finalUrl)) continue;
          seen.add(finalUrl);
          candidates.push({
            url: finalUrl,
            title: s.name,
            meta: {
              tagline: s.tagline,
              topics: s.tags || [],
              tags: [...(s.tags || []), 'BetaList'].filter(Boolean),
            },
          });
        }
      } catch (err) {
        console.warn(`[BetaList] Failed to fetch ${pageUrl}: ${err.message}`);
      }
    }

    return candidates;
  },
};
