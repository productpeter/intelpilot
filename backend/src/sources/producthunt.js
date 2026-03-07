import { extractJson } from '../lib/tabstack.js';

const DAYS_BACK = 15;

function getPHUrls() {
  const urls = [];
  for (let i = 0; i < DAYS_BACK; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    urls.push(`https://www.producthunt.com/leaderboard/daily/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`);
  }
  return urls;
}

const SCHEMA = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Product name' },
          tagline: { type: 'string', description: 'Product tagline' },
          url: { type: 'string', description: 'Product Hunt URL for this product' },
          website: {
            type: ['string', 'null'],
            description: 'External product website URL',
          },
          upvotes: { type: 'number', description: 'Number of upvotes' },
          topics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Topic tags',
          },
          maker: { type: ['string', 'null'], description: 'Maker name if shown' },
        },
        required: ['name', 'tagline'],
      },
    },
  },
  required: ['products'],
};

function toCandidate(p) {
  let url = p.website || p.url || '';
  if (url && !url.startsWith('http')) {
    url = `https://www.producthunt.com${url.startsWith('/') ? '' : '/'}${url}`;
  }
  if (!url) {
    url = `https://www.producthunt.com/posts/${p.name.toLowerCase().replace(/\s+/g, '-')}`;
  }
  return {
    url,
    title: p.name,
    meta: {
      tagline: p.tagline,
      upvotes: p.upvotes,
      website: p.website,
      topics: p.topics || [],
      maker: p.maker,
    },
  };
}

export default {
  name: 'producthunt',
  type: 'html',

  async fetchCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const pageUrl of getPHUrls()) {
      try {
        const result = await extractJson(pageUrl, SCHEMA, { nocache: true });
        for (const p of result.products || []) {
          const c = toCandidate(p);
          if (seen.has(c.url)) continue;
          seen.add(c.url);
          candidates.push(c);
        }
      } catch (err) {
        console.error(`[ProductHunt] Failed to fetch ${pageUrl}:`, err.message);
      }
    }

    console.log(`[ProductHunt] Fetched ${candidates.length} unique candidates from ${DAYS_BACK} days`);
    return candidates;
  },
};
