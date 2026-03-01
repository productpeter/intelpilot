import { extractJson, SCHEMAS } from '../lib/tabstack.js';

const PH_URL = 'https://www.producthunt.com/leaderboard/daily/2026/2/28';

export default {
  name: 'producthunt',
  type: 'html',

  async fetchCandidates() {
    const result = await extractJson(PH_URL, SCHEMAS.productHuntListing, {
      nocache: true,
    });
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
