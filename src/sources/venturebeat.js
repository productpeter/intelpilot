import { extractJson } from '../lib/tabstack.js';

const PAGES = [
  'https://venturebeat.com/category/ai/',
  'https://venturebeat.com/category/ai/page/2/',
  'https://venturebeat.com/category/ai/page/3/',
  'https://venturebeat.com/category/enterprise-analytics/',
  'https://venturebeat.com/category/enterprise-analytics/page/2/',
  'https://venturebeat.com/category/data-infrastructure/',
  'https://venturebeat.com/category/data-infrastructure/page/2/',
  'https://venturebeat.com/category/security/',
  'https://venturebeat.com/category/security/page/2/',
  'https://venturebeat.com/category/programming-development/',
  'https://venturebeat.com/category/games/',
];

const SCHEMA = {
  type: 'object',
  properties: {
    articles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Article headline' },
          url: { type: 'string', description: 'Article URL' },
          summary: { type: ['string', 'null'], description: 'Article excerpt' },
          author: { type: ['string', 'null'], description: 'Author name' },
          date: { type: ['string', 'null'], description: 'Publication date' },
          startup_mentioned: {
            type: ['string', 'null'],
            description: 'Name of the startup or company primarily featured in the article, if any',
          },
        },
        required: ['title', 'url'],
      },
    },
  },
  required: ['articles'],
};

export default {
  name: 'venturebeat',
  type: 'html',

  async fetchCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const pageUrl of PAGES) {
      try {
        const result = await extractJson(pageUrl, SCHEMA, { nocache: true });
        for (const article of result.articles || []) {
          if (!article.url || seen.has(article.url)) continue;
          seen.add(article.url);
          candidates.push({
            url: article.url,
            title: article.title,
            meta: {
              summary: article.summary,
              author: article.author,
              published_date: article.date,
              startup_mentioned: article.startup_mentioned,
              tags: ['VentureBeat', 'AI'],
            },
          });
        }
      } catch (err) {
        console.error(`[VentureBeat] Failed to fetch ${pageUrl}:`, err.message);
      }
    }

    console.log(`[VentureBeat] Fetched ${candidates.length} candidates`);
    return candidates;
  },
};
