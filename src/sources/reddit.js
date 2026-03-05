import axios from 'axios';

const SUBREDDITS = [
  { sub: 'SaaS', limit: 25 },
  { sub: 'startups', limit: 25 },
  { sub: 'indiehackers', limit: 25 },
  { sub: 'AItools', limit: 25 },
  { sub: 'microsaas', limit: 25 },
  { sub: 'Entrepreneur', limit: 25 },
];
const UA = { 'User-Agent': 'node:intelpilot:v1.0 (startup discovery research tool)' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchSubreddit(sub, limit, sort = 'hot') {
  const url = `https://old.reddit.com/r/${sub}/${sort}.json?limit=${limit}&raw_json=1`;

  try {
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
            sort,
            author: d.author,
            upvotes: d.ups,
            comments_count: d.num_comments,
            flair: d.link_flair_text,
            snippet: (d.selftext || '').slice(0, 500) || null,
            tags: [sub, d.link_flair_text].filter(Boolean),
          },
        };
      });
  } catch (err) {
    console.warn(`[Reddit] r/${sub}/${sort} failed: ${err.message}`);
    return [];
  }
}

export default {
  name: 'reddit_multi',
  type: 'html',

  async fetchCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const s of SUBREDDITS) {
      const posts = await fetchSubreddit(s.sub, s.limit, 'hot');
      for (const c of posts) {
        if (seen.has(c.url)) continue;
        seen.add(c.url);
        candidates.push(c);
      }
      await sleep(3000);
    }

    console.log(`[Reddit] Fetched ${candidates.length} unique candidates from ${SUBREDDITS.length} subs (sequential)`);
    return candidates;
  },
};
