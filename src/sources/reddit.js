import { extractJson } from '../lib/tabstack.js';

const SUBREDDIT_URL = 'https://www.reddit.com/r/SaaS/hot/';

const SCHEMA = {
  type: 'object',
  properties: {
    posts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Post title' },
          url: { type: 'string', description: 'Link URL (external link or Reddit comments URL)' },
          reddit_url: { type: 'string', description: 'Reddit comments/discussion URL' },
          author: { type: ['string', 'null'], description: 'Reddit username' },
          upvotes: { type: 'number', description: 'Number of upvotes' },
          comments_count: { type: 'number', description: 'Number of comments' },
          flair: { type: ['string', 'null'], description: 'Post flair tag if present' },
          snippet: { type: ['string', 'null'], description: 'First few lines of the post body text if visible' },
        },
        required: ['title'],
      },
    },
  },
  required: ['posts'],
};

export default {
  name: 'reddit_saas',
  type: 'html',

  async fetchCandidates() {
    const result = await extractJson(SUBREDDIT_URL, SCHEMA, { nocache: true });
    const posts = result.posts || [];

    return posts
      .filter((p) => p.title && (p.url || p.reddit_url))
      .map((p) => {
        let url = p.url || p.reddit_url || '';
        if (url && !url.startsWith('http')) {
          url = `https://www.reddit.com${url.startsWith('/') ? '' : '/'}${url}`;
        }
        return {
          url,
          title: p.title,
          meta: {
            reddit_url: p.reddit_url,
            author: p.author,
            upvotes: p.upvotes,
            comments_count: p.comments_count,
            flair: p.flair,
            snippet: p.snippet,
            tags: p.flair ? [p.flair, 'SaaS'] : ['SaaS'],
          },
        };
      });
  },
};
