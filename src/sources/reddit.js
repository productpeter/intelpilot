import axios from 'axios';

const SUBREDDITS = [
  { sub: 'SaaS', limit: 30 },
  { sub: 'startups', limit: 30 },
  { sub: 'indiehackers', limit: 30 },
  { sub: 'artificial', limit: 20 },
  { sub: 'LocalLLaMA', limit: 20 },
];

const UA = { 'User-Agent': 'IntelPilot/1.0' };

async function fetchSubreddit(sub, limit) {
  const url = `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`;
  const { data } = await axios.get(url, { headers: UA, timeout: 15_000 });
  const posts = data?.data?.children || [];

  return posts
    .filter((p) => p.data && !p.data.stickied)
    .map((p) => {
      const d = p.data;
      const isExternal = d.url && !d.url.includes('reddit.com');
      const redditUrl = `https://www.reddit.com${d.permalink}`;

      return {
        url: isExternal ? d.url : redditUrl,
        title: d.title,
        meta: {
          reddit_url: redditUrl,
          subreddit: sub,
          author: d.author,
          upvotes: d.ups,
          comments_count: d.num_comments,
          flair: d.link_flair_text,
          snippet: (d.selftext || '').slice(0, 500) || null,
          tags: [sub, d.link_flair_text].filter(Boolean),
        },
      };
    });
}

export default {
  name: 'reddit_multi',
  type: 'html',

  async fetchCandidates() {
    const results = await Promise.allSettled(
      SUBREDDITS.map((s) => fetchSubreddit(s.sub, s.limit)),
    );

    const candidates = [];
    for (const r of results) {
      if (r.status === 'fulfilled') candidates.push(...r.value);
    }

    console.log(`[Reddit] Fetched ${candidates.length} candidates from ${SUBREDDITS.length} subreddits`);
    return candidates;
  },
};
