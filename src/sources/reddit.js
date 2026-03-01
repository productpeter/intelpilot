import axios from 'axios';

const SUBREDDIT_URL = 'https://www.reddit.com/r/SaaS/hot.json?limit=50';

export default {
  name: 'reddit_saas',
  type: 'html',

  async fetchCandidates() {
    const { data } = await axios.get(SUBREDDIT_URL, {
      headers: { 'User-Agent': 'IntelPilot/1.0' },
      timeout: 15_000,
    });

    const posts = data?.data?.children || [];

    const STARTUP_PATTERN =
      /\b(built|launched|building|ship|saas|mrr|arr|revenue|users|customers|side.?project|my app|my tool|my product|startup|bootstrapped|indie.?hack|first sale|paying customer|open.?source|beta|mvp|launch|product.?hunt)\b/i;

    return posts
      .filter((p) => {
        if (!p.data || p.data.stickied) return false;
        const d = p.data;
        const text = `${d.title} ${d.selftext || ''} ${d.link_flair_text || ''}`;
        return STARTUP_PATTERN.test(text);
      })
      .map((p) => {
        const d = p.data;
        const isExternal = d.url && !d.url.includes('reddit.com');
        const redditUrl = `https://www.reddit.com${d.permalink}`;

        return {
          url: isExternal ? d.url : redditUrl,
          title: d.title,
          meta: {
            reddit_url: redditUrl,
            author: d.author,
            upvotes: d.ups,
            comments_count: d.num_comments,
            flair: d.link_flair_text,
            snippet: (d.selftext || '').slice(0, 500) || null,
            tags: d.link_flair_text ? [d.link_flair_text, 'SaaS'] : ['SaaS'],
          },
        };
      });
  },
};
