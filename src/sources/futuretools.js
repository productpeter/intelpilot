import { extractJson } from '../lib/tabstack.js';

const PAGES = [
  'https://www.futuretools.io/recently-added',
  'https://www.futuretools.io/',
  'https://www.futuretools.io/ai-tools?sort=most-popular',
  'https://www.futuretools.io/ai-tools?sort=most-popular&page=2',
  'https://www.futuretools.io/ai-tools?sort=most-popular&page=3',
  'https://www.futuretools.io/ai-tools?pricing-model=free&sort=most-popular',
  'https://www.futuretools.io/ai-tools?pricing-model=free&sort=most-popular&page=2',
  'https://www.futuretools.io/ai-tools?pricing-model=freemium&sort=most-popular',
  'https://www.futuretools.io/ai-tools?pricing-model=freemium&sort=most-popular&page=2',
  'https://www.futuretools.io/ai-tools?sort=newest',
  'https://www.futuretools.io/ai-tools?sort=newest&page=2',
];

const SCHEMA = {
  type: 'object',
  properties: {
    tools: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'AI tool name' },
          description: { type: 'string', description: 'Short description of what the tool does' },
          url: { type: 'string', description: 'URL to the tool page or external site' },
          category: { type: ['string', 'null'], description: 'Tool category (e.g. Image, Writing, Code, etc.)' },
          pricing: { type: ['string', 'null'], description: 'Pricing info (Free, Freemium, Paid, etc.)' },
        },
        required: ['name'],
      },
    },
  },
  required: ['tools'],
};

export default {
  name: 'futuretools',
  type: 'html',

  async fetchCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const pageUrl of PAGES) {
      try {
        const result = await extractJson(pageUrl, SCHEMA, { nocache: true });
        for (const tool of result.tools || []) {
          let url = tool.url || '';
          if (url && !url.startsWith('http')) {
            url = `https://www.futuretools.io${url.startsWith('/') ? '' : '/'}${url}`;
          }
          const finalUrl = url || 'https://www.futuretools.io';
          if (seen.has(finalUrl)) continue;
          seen.add(finalUrl);
          candidates.push({
            url: finalUrl,
            title: tool.name,
            meta: {
              description: tool.description,
              category: tool.category,
              pricing: tool.pricing,
              tags: [tool.category, 'FutureTools'].filter(Boolean),
            },
          });
        }
      } catch (err) {
        console.error(`[FutureTools] Failed to fetch ${pageUrl}:`, err.message);
      }
    }

    console.log(`[FutureTools] Fetched ${candidates.length} candidates`);
    return candidates;
  },
};
