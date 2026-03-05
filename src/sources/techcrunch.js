import { extractJson } from '../lib/tabstack.js';

const PAGES = [
  'https://techcrunch.com/category/artificial-intelligence/',
  'https://techcrunch.com/category/artificial-intelligence/page/2/',
  'https://techcrunch.com/category/artificial-intelligence/page/3/',
  'https://techcrunch.com/tag/generative-ai/',
  'https://techcrunch.com/tag/generative-ai/page/2/',
  'https://techcrunch.com/category/startups/',
  'https://techcrunch.com/category/startups/page/2/',
  'https://techcrunch.com/category/startups/page/3/',
  'https://techcrunch.com/category/venture/',
  'https://techcrunch.com/category/venture/page/2/',
  'https://techcrunch.com/category/apps/',
  'https://techcrunch.com/category/apps/page/2/',
  'https://techcrunch.com/tag/saas/',
  'https://techcrunch.com/tag/saas/page/2/',
  'https://techcrunch.com/tag/funding/',
  'https://techcrunch.com/tag/funding/page/2/',
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
          summary: { type: ['string', 'null'], description: 'Article excerpt or summary' },
          author: { type: ['string', 'null'], description: 'Author name' },
          date: { type: ['string', 'null'], description: 'Publication date' },
          startup_mentioned: { type: ['string', 'null'], description: 'Name of the startup or company primarily featured in the article, if any' },
        },
        required: ['title', 'url'],
      },
    },
  },
  required: ['articles'],
};

export default {
  name: 'techcrunch_ai',
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
              tags: ['TechCrunch', 'AI'],
            },
          });
        }
      } catch (err) {
        console.error(`[TechCrunch] Failed to fetch ${pageUrl}:`, err.message);
      }
    }

    console.log(`[TechCrunch] Fetched ${candidates.length} candidates`);
    return candidates;
  },
};
