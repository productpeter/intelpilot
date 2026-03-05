import axios from 'axios';

const SUBREDDITS = [
  { sub: 'SaaS', limit: 250 },
  { sub: 'startups', limit: 250 },
  { sub: 'indiehackers', limit: 250 },
  { sub: 'artificial', limit: 200 },
  { sub: 'LocalLLaMA', limit: 200 },
  { sub: 'machinelearning', limit: 150 },
  { sub: 'ChatGPT', limit: 150 },
  { sub: 'singularity', limit: 100 },
  { sub: 'OpenAI', limit: 100 },
  { sub: 'AItools', limit: 150 },
  { sub: 'Entrepreneur', limit: 200 },
  { sub: 'microsaas', limit: 150 },
  { sub: 'selfhosted', limit: 150 },
];

const SORTS = ['hot', 'new'];
const UA = { 'User-Agent': 'IntelPilot/1.0' };

async function fetchSubreddit(sub, limit, sort = 'hot') {
  const url = `https://www.reddit.com/r/${sub}/${sort}.json?limit=${limit}`;
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
}

export default {
  name: 'reddit_multi',
  type: 'html',

  async fetchCandidates() {
    const fetches = SUBREDDITS.flatMap((s) =>
      SORTS.map((sort) => fetchSubreddit(s.sub, s.limit, sort)),
    );
    const results = await Promise.allSettled(fetches);

    const seen = new Set();
    const candidates = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const c of r.value) {
        if (seen.has(c.url)) continue;
        seen.add(c.url);
        candidates.push(c);
      }
    }

    console.log(`[Reddit] Fetched ${candidates.length} unique candidates from ${SUBREDDITS.length} subs × ${SORTS.length} sorts`);
    return candidates;
  },
};
