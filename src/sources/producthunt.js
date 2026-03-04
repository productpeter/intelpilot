import { extractJson } from '../lib/tabstack.js';

function getPHUrl() {
  const d = new Date();
  return `https://www.producthunt.com/leaderboard/daily/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
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

export default {
  name: 'producthunt',
  type: 'html',

  async fetchCandidates() {
    const result = await extractJson(getPHUrl(), SCHEMA, { nocache: true });
    const products = result.products || [];

    return products.map((p) => {
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
    });
  },
};
