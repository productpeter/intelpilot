import { extractJson } from '../lib/tabstack.js';

const PAGES = [
  { url: 'https://github.com/trending?since=daily', label: 'GitHub Trending Daily' },
  { url: 'https://github.com/trending?since=weekly&spoken_language_code=en', label: 'GitHub Trending Weekly' },
  { url: 'https://github.com/trending?since=monthly', label: 'GitHub Trending Monthly' },
  { url: 'https://github.com/trending/python?since=daily', label: 'GitHub Trending Python' },
  { url: 'https://github.com/trending/typescript?since=daily', label: 'GitHub Trending TypeScript' },
];

const SCHEMA = {
  type: 'object',
  properties: {
    repositories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Repository name (owner/repo format)' },
          description: { type: 'string', description: 'Repository description' },
          url: { type: 'string', description: 'GitHub repository URL' },
          language: { type: ['string', 'null'], description: 'Primary programming language' },
          stars: { type: ['number', 'null'], description: 'Total star count' },
          stars_today: { type: ['number', 'null'], description: 'Stars gained today/this period' },
        },
        required: ['name', 'url'],
      },
    },
  },
  required: ['repositories'],
};

export default {
  name: 'github_trending',
  type: 'html',

  async fetchCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const page of PAGES) {
      try {
        const result = await extractJson(page.url, SCHEMA, { nocache: true });
        for (const repo of result.repositories || []) {
          let url = repo.url || '';
          if (url && !url.startsWith('http')) url = `https://github.com/${url}`;
          if (!url || seen.has(url)) continue;
          seen.add(url);
          candidates.push({
            url,
            title: repo.name,
            meta: {
              description: repo.description,
              language: repo.language,
              stars: repo.stars,
              stars_today: repo.stars_today,
              source_page: page.label,
              tags: ['GitHub', repo.language, 'open-source'].filter(Boolean),
            },
          });
        }
      } catch (err) {
        console.error(`[GitHub] Failed to fetch ${page.label}:`, err.message);
      }
    }

    console.log(`[GitHub] Fetched ${candidates.length} unique candidates`);
    return candidates;
  },
};
