import { extractJson } from '../lib/tabstack.js';

const PAGES = [
  { url: 'https://wellfound.com/startups/artificial-intelligence', label: 'Wellfound AI' },
  { url: 'https://wellfound.com/startups/saas', label: 'Wellfound SaaS' },
  { url: 'https://wellfound.com/startups/generative-ai', label: 'Wellfound GenAI' },
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
          url: { type: 'string', description: 'URL to the startup profile or website' },
          website: { type: ['string', 'null'], description: 'Company website URL if visible' },
          tagline: { type: ['string', 'null'], description: 'One-line description or tagline' },
          location: { type: ['string', 'null'], description: 'HQ location' },
          stage: { type: ['string', 'null'], description: 'Funding stage (seed, series A, etc.)' },
          team_size: { type: ['string', 'null'], description: 'Team/employee count' },
          category: { type: ['string', 'null'], description: 'Industry or category' },
        },
        required: ['name'],
      },
    },
  },
  required: ['startups'],
};

export default {
  name: 'wellfound',
  type: 'html',

  async fetchCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const page of PAGES) {
      try {
        const result = await extractJson(page.url, SCHEMA, { nocache: true });
        for (const s of result.startups || []) {
          let url = s.website || s.url || '';
          if (url && !url.startsWith('http')) url = `https://${url}`;
          if (!url || seen.has(url)) continue;
          seen.add(url);
          candidates.push({
            url,
            title: s.name,
            meta: {
              tagline: s.tagline,
              location: s.location,
              stage: s.stage,
              team_size: s.team_size,
              category: s.category,
              source_page: page.label,
              tags: ['Wellfound', s.category].filter(Boolean),
            },
          });
        }
      } catch (err) {
        console.warn(`[Wellfound] Failed to fetch ${page.label}: ${err.message}`);
      }
    }

    console.log(`[Wellfound] Fetched ${candidates.length} unique candidates`);
    return candidates;
  },
};
