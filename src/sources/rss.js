import { extractJson } from '../lib/tabstack.js';

const SCHEMA = {
  type: 'object',
  properties: {
    articles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Article title' },
          url: { type: 'string', description: 'Article URL' },
          summary: {
            type: ['string', 'null'],
            description: 'Article summary or excerpt',
          },
          author: { type: ['string', 'null'], description: 'Author name' },
          published_date: {
            type: ['string', 'null'],
            description: 'Publication date',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Category or topic tags',
          },
        },
        required: ['title', 'url'],
      },
    },
  },
  required: ['articles'],
};

const FEEDS = [
  {
    name: 'tldr_ai',
    url: 'https://tldr.tech/ai',
    label: 'TLDR AI Newsletter',
  },
  {
    name: 'hn_newest',
    url: 'https://news.ycombinator.com/newest',
    label: 'Hacker News New',
  },
  {
    name: 'theresanaiforthat_new',
    url: 'https://theresanaiforthat.com/new/',
    label: "There's An AI For That - New",
  },
  {
    name: 'theresanaiforthat_saved',
    url: 'https://theresanaiforthat.com/most-saved/',
    label: "There's An AI For That - Most Saved",
  },
  {
    name: 'theresanaiforthat_trending',
    url: 'https://theresanaiforthat.com/trending/',
    label: "There's An AI For That - Trending",
  },
  {
    name: 'theresanaiforthat_featured',
    url: 'https://theresanaiforthat.com/',
    label: "There's An AI For That - Featured",
  },
  {
    name: 'hn_top',
    url: 'https://news.ycombinator.com/',
    label: 'Hacker News Front Page',
  },
];

export default {
  name: 'rss_feeds',
  type: 'rss',

  async fetchCandidates() {
    const candidates = [];

    for (const feed of FEEDS) {
      try {
        const result = await extractJson(feed.url, SCHEMA, { nocache: true });

        for (const article of result.articles || []) {
          candidates.push({
            url: article.url,
            title: article.title,
            meta: {
              feed_name: feed.name,
              feed_label: feed.label,
              summary: article.summary,
              author: article.author,
              published_date: article.published_date,
              tags: (article.tags || []).filter(Boolean),
            },
          });
        }
      } catch (err) {
        console.error(`[RSS] Failed to fetch ${feed.name}:`, err.message);
      }
    }

    return candidates;
  },
};
