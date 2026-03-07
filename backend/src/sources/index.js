import producthunt from './producthunt.js';
import hackernews from './hackernews.js';
import rss from './rss.js';
import reddit from './reddit.js';
import betalist from './betalist.js';
import futuretools from './futuretools.js';
import techcrunch from './techcrunch.js';
import aitoolsdirectory from './aitoolsdirectory.js';
import yclaunches from './yclaunches.js';
import github from './github.js';
import venturebeat from './venturebeat.js';
import wellfound from './wellfound.js';
import indiehackers from './indiehackers.js';

const sources = [
  producthunt,
  hackernews,
  rss,
  reddit,
  betalist,
  futuretools,
  techcrunch,
  aitoolsdirectory,
  yclaunches,
  github,
  venturebeat,
  wellfound,
  indiehackers,
];

export function getAllSources() {
  return sources;
}
