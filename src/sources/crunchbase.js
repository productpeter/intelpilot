import { extractJson } from '../lib/tabstack.js';

const PAGES = [
  'https://www.crunchbase.com/discover/organization.companies/field/organizations/categories/artificial-intelligence',
  'https://www.crunchbase.com/discover/organization.companies/field/organizations/categories/generative-ai',
  'https://www.crunchbase.com/discover/organization.companies/field/organizations/categories/saas',
];

const SCHEMA = {
  type: 'object',
  properties: {
    companies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Company name' },
          url: { type: 'string', description: 'URL to the Crunchbase profile or company website' },
          website: { type: ['string', 'null'], description: 'Company website URL if visible' },
          description: { type: ['string', 'null'], description: 'Short description' },
          location: { type: ['string', 'null'], description: 'HQ location' },
          funding: { type: ['string', 'null'], description: 'Total funding amount if shown' },
          founded: { type: ['string', 'null'], description: 'Founded year' },
          category: { type: ['string', 'null'], description: 'Industry category' },
        },
        required: ['name'],
      },
    },
  },
  required: ['companies'],
};

export default {
  name: 'crunchbase',
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
              description: c.description,
              location: c.location,
              funding: c.funding,
              founded: c.founded,
              category: c.category,
              source_page: 'Crunchbase',
              tags: ['Crunchbase', c.category].filter(Boolean),
            },
          });
        }
      } catch (err) {
        console.warn(`[Crunchbase] Failed to fetch ${pageUrl}: ${err.message}`);
      }
    }

    console.log(`[Crunchbase] Fetched ${candidates.length} unique candidates`);
    return candidates;
  },
};
