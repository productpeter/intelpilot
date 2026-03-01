import producthunt from './producthunt.js';
import hackernews from './hackernews.js';
import rss from './rss.js';
import reddit from './reddit.js';
import betalist from './betalist.js';

const sources = [producthunt, hackernews, rss, reddit, betalist];

export function getAllSources() {
  return sources;
}

export function getSourceByName(name) {
  return sources.find((s) => s.name === name);
}
