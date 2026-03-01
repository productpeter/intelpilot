import { extractJson, SCHEMAS } from '../lib/tabstack.js';

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
];

export default {
  name: 'rss_feeds',
  type: 'rss',

  async fetchCandidates() {
    const candidates = [];

    for (const feed of FEEDS) {
      try {
        const result = await extractJson(feed.url, SCHEMAS.rssFeedPage, {
          nocache: true,
        });

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
              tags: article.tags || [],
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
