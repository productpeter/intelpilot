import { extractJson } from '../lib/tabstack.js';

const PAGES = [
  'https://www.ycombinator.com/launches',
  'https://www.ycombinator.com/companies?batch=W25&status=Active',
  'https://www.ycombinator.com/companies?batch=S24&status=Active',
  'https://www.ycombinator.com/companies?batch=W24&status=Active',
];

const SCHEMA = {
  type: 'object',
  properties: {
    companies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Company/startup name' },
          tagline: { type: 'string', description: 'One-line description' },
          url: { type: 'string', description: 'URL to the company page or external website' },
          website: { type: ['string', 'null'], description: 'External product website if available' },
          batch: { type: ['string', 'null'], description: 'YC batch (e.g. W25, S24)' },
          category: { type: ['string', 'null'], description: 'Industry or category' },
        },
        required: ['name'],
      },
    },
  },
  required: ['companies'],
};

export default {
  name: 'yc_launches',
  type: 'html',

  async fetchCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const pageUrl of PAGES) {
      try {
        const result = await extractJson(pageUrl, SCHEMA, { nocache: true });
        for (const c of result.companies || []) {
          let url = c.website || c.url || '';
          if (url && !url.startsWith('http')) url = `https://${url}`;
          if (!url || seen.has(url)) continue;
          seen.add(url);
          candidates.push({
            url,
            title: c.name,
            meta: {
              tagline: c.tagline,
              website: c.website,
              batch: c.batch,
              category: c.category,
              tags: ['YC', c.batch, c.category].filter(Boolean),
              source_page: 'Y Combinator',
            },
          });
        }
      } catch (err) {
        console.error(`[YCLaunches] Failed to fetch ${pageUrl}:`, err.message);
      }
    }

    console.log(`[YCLaunches] Fetched ${candidates.length} candidates`);
    return candidates;
  },
};
