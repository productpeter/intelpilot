import { extractJson, extractMarkdown } from '../lib/tabstack.js';
import { extractSignals, addTrendSignals } from '../lib/signals.js';
import { uploadSnapshot, buildSnapshotKey } from '../lib/r2.js';
import { resolveEntity } from './entities.js';
import { col } from '../db/mongo.js';
import config from '../config/index.js';

const GENERIC_PAGE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'The main title or heading of the page',
    },
    entity_name: {
      type: 'string',
      description: 'The company or product name featured on this page',
    },
    domain: {
      type: 'string',
      description: 'The canonical domain of the company/product (e.g. example.com)',
    },
    description: {
      type: 'string',
      description: 'A short 1-2 sentence description of the company/product',
    },
    published_date: {
      type: ['string', 'null'],
      description: 'Publication or launch date if available (ISO 8601)',
    },
    snippets: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Key text snippets, prioritizing any mentions of revenue, MRR, ARR, earnings, profit, sales figures, growth metrics, and monetization. Also include pricing and customer count claims.',
    },
    pricing_text: {
      type: ['string', 'null'],
      description: 'Any pricing information mentioned on the page',
    },
    revenue_mentions: {
      type: 'array',
      items: { type: 'string' },
      description:
        'IMPORTANT: Extract ALL explicit revenue, MRR, ARR, income, profit, sales, or earnings figures. Include exact dollar amounts, growth claims (e.g. "$0 to $50k MRR"), and any monetization metrics. This is the highest priority field.',
    },
    customer_count_mentions: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Claims about number of customers or users (e.g. "500 customers", "10k users", "50K DAU", "1M downloads")',
    },
    funding_mentions: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Any funding or investment mentions (e.g. "$2M seed round", "raised $500K", "bootstrapped", "YC W24", "backed by Sequoia")',
    },
    growth_mentions: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Growth rate claims (e.g. "grew 30% MoM", "doubled in 3 months", "10x in a year", "3x revenue growth")',
    },
    team_size_mentions: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Team or employee count (e.g. "solo founder", "team of 5", "2-person startup", "50 employees")',
    },
    relevant_links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          url: { type: 'string' },
        },
      },
      description: 'Important links: pricing page, homepage, docs, GitHub repo',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Category or topic tags inferred from the content (e.g. AI, SaaS, Developer Tools)',
    },
  },
  required: ['title'],
};

export async function processDiscovery(discovery, sourceDoc) {
  const url = discovery.candidate_url;
  console.log(`[Extractor] Processing: ${url}`);

  const hasSnippet = discovery.meta?.snippet;
  const isRedditSelf = /reddit\.com\/r\//.test(url) && hasSnippet;

  let structured;
  let markdownContent = null;

  if (isRedditSelf) {
    structured = buildStructuredFromMeta(discovery);
    markdownContent = `# ${discovery.title}\n\n${discovery.meta.snippet}`;
  } else {
    structured = await extractJson(url, GENERIC_PAGE_SCHEMA, { nocache: true });
    try {
      const mdResult = await extractMarkdown(url);
      markdownContent = mdResult.content || null;
    } catch (err) {
      console.warn(`[Extractor] Markdown extraction failed for ${url}:`, err.message);
    }
  }

  let r2Key = null;
  if (config.r2.endpoint && markdownContent) {
    try {
      r2Key = buildSnapshotKey(url);
      await uploadSnapshot(r2Key, markdownContent);
    } catch (err) {
      console.warn('[Extractor] R2 upload failed:', err.message);
      r2Key = null;
    }
  }

  const rawPage = {
    url,
    fetched_at: new Date(),
    source_id: discovery.source_id,
    extracted_text: markdownContent,
    r2_snapshot_key: r2Key,
    tabstack_payload: structured,
  };
  const { insertedId: rawPageId } = await col('raw_pages').insertOne(rawPage);

  const snippets = structured.snippets || [];
  const mainSnippet = snippets[0] || structured.description || structured.title || '';

  const evidence = {
    url,
    type: inferEvidenceType(url, structured),
    snippet: mainSnippet,
    captured_at: new Date(),
    raw_page_id: rawPageId,
    r2_snapshot_key: r2Key,
  };
  const { insertedId: evidenceId } = await col('evidence').insertOne(evidence);

  const entityCandidate = {
    name: structured.entity_name || structured.title || discovery.title,
    canonical_domain: structured.domain || extractDomain(url),
    description: structured.description || discovery.meta?.tagline || '',
    tags: [
      ...(structured.tags || []),
      ...(discovery.meta?.topics || []),
      ...(discovery.meta?.tags || []),
    ],
    identifiers: buildIdentifiers(url, structured),
  };

  const entity = await resolveEntity(entityCandidate);

  const allText = [
    structured.title,
    structured.description,
    structured.pricing_text,
    ...(structured.revenue_mentions || []),
    ...(structured.customer_count_mentions || []),
    ...(structured.funding_mentions || []),
    ...(structured.growth_mentions || []),
    ...(structured.team_size_mentions || []),
    ...snippets,
  ]
    .filter(Boolean)
    .join('\n');

  const signals = extractSignals(allText, snippets);
  const trendSignals = addTrendSignals(structured.tags);

  for (const sig of [...signals, ...trendSignals]) {
    await col('signals').insertOne({
      ...sig,
      entity_id: entity._id,
      evidence_id: evidenceId,
      source_id: discovery.source_id,
      captured_at: new Date(),
    });
  }

  await col('discoveries').updateOne(
    { _id: discovery._id },
    { $set: { entity_id: entity._id, extraction_ref: rawPageId } },
  );

  const totalSignals = signals.length + trendSignals.length;
  console.log(`[Extractor] Done: ${entityCandidate.name} (${totalSignals} signals)`);
  return { entity, signals: [...signals, ...trendSignals], evidence };
}

function inferEvidenceType(url, structured) {
  if (/pricing/i.test(url) || structured.pricing_text) return 'pricing';
  if (/producthunt/i.test(url)) return 'post';
  if (/news\.ycombinator/i.test(url)) return 'post';
  return 'page';
}

function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const aggregators = [
      'producthunt.com',
      'news.ycombinator.com',
      'reddit.com',
      'old.reddit.com',
      'techcrunch.com',
      'tldr.tech',
    ];
    return aggregators.includes(hostname) ? null : hostname;
  } catch {
    return null;
  }
}

function buildIdentifiers(url, structured) {
  const ids = {};
  if (/producthunt\.com/i.test(url)) ids.producthunt = url;
  if (/news\.ycombinator/i.test(url)) ids.hackernews = url;
  if (/reddit\.com/i.test(url)) ids.reddit = url;
  for (const link of structured.relevant_links || []) {
    if (/github\.com/i.test(link.url)) ids.github = link.url;
    if (/twitter\.com|x\.com/i.test(link.url)) ids.twitter = link.url;
  }
  return ids;
}

function buildStructuredFromMeta(discovery) {
  const m = discovery.meta || {};
  const text = m.snippet || '';
  const title = discovery.title || '';

  let entityName = title.replace(/[\[\(].*?[\]\)]/g, '').trim();
  if (entityName.length > 80) entityName = entityName.slice(0, 80);

  let pseudoDomain = null;
  try {
    const parts = new URL(discovery.candidate_url).pathname.split('/');
    const postId = parts.find((_, i) => parts[i - 1] === 'comments');
    if (postId) pseudoDomain = `reddit-${postId}`;
  } catch {}

  return {
    title,
    entity_name: entityName || null,
    domain: pseudoDomain,
    description: text.slice(0, 200),
    published_date: null,
    snippets: text ? [text] : [],
    pricing_text: null,
    revenue_mentions: [],
    customer_count_mentions: [],
    funding_mentions: [],
    growth_mentions: [],
    team_size_mentions: [],
    relevant_links: [],
    tags: m.tags || [],
  };
}
