import axios from 'axios';

const HN_API = 'https://hacker-news.firebaseio.com/v0';
const HN_SHOW_URL = 'https://news.ycombinator.com/item?id=';

export default {
  name: 'hackernews_show',
  type: 'html',

  async fetchCandidates() {
    const { data: ids } = await axios.get(`${HN_API}/showstories.json`, {
      timeout: 15_000,
    });

    const top = ids.slice(0, 500);

    const BATCH = 50;
    const candidates = [];
    for (let i = 0; i < top.length; i += BATCH) {
      const batch = top.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((id) =>
          axios.get(`${HN_API}/item/${id}.json`, { timeout: 10_000 }),
        ),
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status !== 'fulfilled') continue;
        const item = results[j].value.data;
        if (!item || item.dead || item.deleted) continue;
        const id = batch[j];
        candidates.push({
          url: item.url || `${HN_SHOW_URL}${id}`,
          title: item.title,
          meta: {
            hn_url: `${HN_SHOW_URL}${id}`,
            points: item.score,
            author: item.by,
            comments_count: item.descendants || 0,
            posted_at: new Date(item.time * 1000).toISOString(),
          },
        });
      }
    }

    return candidates;
  },
};
