import producthunt from './producthunt.js';
import hackernews from './hackernews.js';
import rss from './rss.js';
import reddit from './reddit.js';
import betalist from './betalist.js';
import futuretools from './futuretools.js';
import techcrunch from './techcrunch.js';
import aitoolsdirectory from './aitoolsdirectory.js';

const sources = [
  producthunt,
  hackernews,
  rss,
  reddit,
  betalist,
  futuretools,
  techcrunch,
  aitoolsdirectory,
];

export function getAllSources() {
  return sources;
}

export function getSourceByName(name) {
  return sources.find((s) => s.name === name);
}
