import { extractJson } from '../lib/tabstack.js';

const PAGES = [
  { url: 'https://www.indiehackers.com/', label: 'IH Homepage' },
];

const SCHEMA = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Product name' },
          url: { type: 'string', description: 'URL to the product page or website' },
          website: { type: ['string', 'null'], description: 'External product website if visible' },
          tagline: { type: ['string', 'null'], description: 'Product tagline' },
          revenue: { type: ['string', 'null'], description: 'Monthly revenue if shown (e.g. "$5K/mo")' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Product tags or categories',
          },
        },
        required: ['name'],
      },
    },
  },
  required: ['products'],
};

export default {
  name: 'indiehackers',
  type: 'html',

  async fetchCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const page of PAGES) {
      try {
        const result = await extractJson(page.url, SCHEMA, { nocache: true });
        for (const p of result.products || []) {
          let url = p.website || p.url || '';
          if (url && !url.startsWith('http')) url = `https://${url}`;
          if (!url || seen.has(url)) continue;
          seen.add(url);
          candidates.push({
            url,
            title: p.name,
            meta: {
              tagline: p.tagline,
              revenue: p.revenue,
              source_page: page.label,
              tags: [...(p.tags || []), 'IndieHackers'].filter(Boolean),
            },
          });
        }
      } catch (err) {
        console.warn(`[IndieHackers] Failed to fetch ${page.label}: ${err.message}`);
      }
    }

    console.log(`[IndieHackers] Fetched ${candidates.length} unique candidates`);
    return candidates;
  },
};
