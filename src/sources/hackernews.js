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
    const candidates = [];

    for (const id of top) {
      try {
        const { data: item } = await axios.get(`${HN_API}/item/${id}.json`, {
          timeout: 10_000,
        });
        if (!item || item.dead || item.deleted) continue;

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
      } catch {
        continue;
      }
    }

    return candidates;
  },
};
