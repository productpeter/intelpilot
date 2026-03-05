import { extractJson } from '../lib/tabstack.js';

const BETALIST_URL = 'https://betalist.com/startups';

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
    const result = await extractJson(BETALIST_URL, SCHEMA, { nocache: true });
    const startups = result.startups || [];

    return startups.map((s) => {
      let url = s.url || '';
      if (url && !url.startsWith('http')) {
        url = `https://betalist.com${url.startsWith('/') ? '' : '/'}${url}`;
      }
      return {
        url: url || `https://betalist.com/startups`,
        title: s.name,
        meta: {
          tagline: s.tagline,
          topics: s.tags || [],
          tags: [...(s.tags || []), 'BetaList'].filter(Boolean),
        },
      };
    });
  },
};
