import { extractJson } from '../lib/tabstack.js';

const PAGES = [
  { url: 'https://www.toolify.ai/newly-launched', label: 'Toolify New' },
  { url: 'https://www.toolify.ai/best-ai-tools', label: 'Toolify Trending' },
  { url: 'https://aitools.fyi/new', label: 'AITools.fyi New' },
  { url: 'https://aitools.fyi/trending', label: 'AITools.fyi Trending' },
  { url: 'https://www.topai.tools/new', label: 'TopAI.tools New' },
  { url: 'https://uneed.best/new', label: 'Uneed New' },
  { url: 'https://www.saashub.com/new', label: 'SaaSHub New' },
];

const SCHEMA = {
  type: 'object',
  properties: {
    tools: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'AI tool/product name' },
          description: { type: 'string', description: 'Short description' },
          url: { type: 'string', description: 'URL to the tool listing page or external website' },
          category: { type: ['string', 'null'], description: 'Category or tag' },
          website: { type: ['string', 'null'], description: 'External product website if available' },
        },
        required: ['name'],
      },
    },
  },
  required: ['tools'],
};

export default {
  name: 'ai_directories',
  type: 'html',

  async fetchCandidates() {
    const candidates = [];

    for (const page of PAGES) {
      try {
        const result = await extractJson(page.url, SCHEMA, { nocache: true });
        for (const tool of result.tools || []) {
          let url = tool.website || tool.url || '';
          if (url && !url.startsWith('http')) {
            url = `https://${url}`;
          }
          candidates.push({
            url: url || page.url,
            title: tool.name,
            meta: {
              description: tool.description,
              category: tool.category,
              website: tool.website,
              source_page: page.label,
              tags: [tool.category, page.label].filter(Boolean),
            },
          });
        }
      } catch (err) {
        console.error(`[AIDirectories] Failed to fetch ${page.label}:`, err.message);
      }
    }

    console.log(`[AIDirectories] Fetched ${candidates.length} candidates`);
    return candidates;
  },
};
