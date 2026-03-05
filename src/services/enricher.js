import { research } from '../lib/tabstack.js';
import { chatJson } from '../lib/openai.js';
import { col } from '../db/mongo.js';
import { isValidProductUrl } from './extractor.js';
import { startJob, updateJob, finishJob, failJob } from './progress.js';
import { betterName } from '../lib/namefix.js';

const EXTRACT_PROMPT = `You are a startup data extractor. Given research text about a startup/company, extract structured metrics. Respond with JSON:

{
  "matched_name": "The exact company/product name found in the research",
  "domain_status": "One of: active, parked, for_sale, dead, unknown",
  "revenue": "ACTUAL company revenue/MRR/ARR figure, e.g. '$50K MRR' or '$1.2M ARR', or null. Do NOT include product pricing like '$49/month' or '$99/year' — those are prices, not revenue",
  "funding": "Single string summary, e.g. '$2M seed from Y Combinator' or '$50M Series A', or null",
  "team_size": "Single string, e.g. '12 employees' or 'solo founder', or null",
  "user_count": "Single string, e.g. '10K users' or '500 customers', or null",
  "growth": "Single string, e.g. '30% MoM growth' or 'doubled in 3 months', or null",
  "founded_year": "Year as a string, e.g. '2024', or null",
  "description": "A concise 1-2 sentence description of what the company does",
  "website": "Primary website URL if found, or null",
  "notable": "Any notable facts (e.g. YC batch, notable customers, awards)"
}

IMPORTANT: Every field must be either null or a plain string. NEVER return objects or arrays for any field. Summarize complex data into a single readable string.
Only include data explicitly stated in the research. Do not guess or fabricate numbers.`;

const ENRICHMENT_CONCURRENCY = 3;

export async function enrichEntities(entities) {
  console.log(`[Enricher] Starting enrichment for ${entities.length} entities…`);
  const job = startJob('enrich');
  job.total = entities.length;
  const results = [];

  const chunks = [];
  for (let i = 0; i < entities.length; i += ENRICHMENT_CONCURRENCY) {
    chunks.push(entities.slice(i, i + ENRICHMENT_CONCURRENCY));
  }

  try {
    for (const chunk of chunks) {
      const settled = await Promise.allSettled(
        chunk.map((entity) => enrichSingle(entity)),
      );
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) {
          results.push(r.value);
          job.completed++;
        } else {
          job.failed++;
        }
        updateJob('enrich', { completed: job.completed, failed: job.failed });
      }
    }
    finishJob('enrich', `${results.length}/${entities.length} enriched`);
  } catch (err) {
    failJob('enrich', err.message);
    throw err;
  }

  console.log(`[Enricher] Completed: ${results.length}/${entities.length} enriched`);
  return results;
}

async function enrichSingle(entity) {
  const name = entity.name;
  const domain = entity.canonical_domain;
  const query = buildResearchQuery(name, domain, entity.description);

  console.log(`[Enricher] Researching: ${name}`);

  let researchText;
  try {
    researchText = await research(query, 'fast');
  } catch (err) {
    console.warn(`[Enricher] Research failed for "${name}":`, err.message);
    return null;
  }

  let metrics;
  try {
    metrics = await chatJson(EXTRACT_PROMPT, researchText);
  } catch (err) {
    console.warn(`[Enricher] Extraction failed for "${name}":`, err.message);
    return null;
  }

  for (const key of ['revenue', 'funding', 'team_size', 'user_count', 'growth', 'founded_year', 'notable']) {
    const v = metrics[key];
    if (v && typeof v === 'object') {
      metrics[key] = v.total ? String(v.total) : JSON.stringify(v);
    }
  }

  const matchedName = (metrics.matched_name || '').toLowerCase().trim();
  const entityNameLower = name.toLowerCase().trim();
  const nameMatches = matchedName &&
    (matchedName.includes(entityNameLower) ||
     entityNameLower.includes(matchedName) ||
     levenshteinRatio(matchedName, entityNameLower) >= 0.7);

  if (!nameMatches) {
    console.warn(`[Enricher] Name mismatch for "${name}": research found "${metrics.matched_name}" — skipping description/website override`);
  }

  const enrichment = {
    research_text: researchText.slice(0, 2000),
    metrics,
    name_matched: nameMatches,
    enriched_at: new Date(),
  };

  await col('entities').updateOne(
    { _id: entity._id },
    { $set: { enrichment } },
  );

  const signalMap = {
    revenue: 'revenue_claim',
    funding: 'funding_raised',
    user_count: 'user_count',
    team_size: 'team_size',
    growth: 'growth_rate',
  };

  for (const [field, signalType] of Object.entries(signalMap)) {
    if (nameMatches && metrics[field] && typeof metrics[field] === 'string') {
      const existing = await col('signals').findOne({
        entity_id: entity._id,
        signal_type: signalType,
        value_text: metrics[field],
      });
      if (!existing) {
        await col('signals').insertOne({
          signal_type: signalType,
          value_text: metrics[field],
          value_num: null,
          unit: null,
          confidence: 0.85,
          entity_id: entity._id,
          evidence_id: null,
          source_id: null,
          captured_at: new Date(),
          enriched: true,
        });
      }
    }
  }

  let enrichedWebsite = metrics.website || null;
  if (enrichedWebsite && !/^https?:\/\//i.test(enrichedWebsite)) {
    if (/^\//.test(enrichedWebsite) || !enrichedWebsite.includes('.')) {
      enrichedWebsite = null;
    } else {
      enrichedWebsite = `https://${enrichedWebsite}`;
    }
  }
  if (enrichedWebsite && !isValidProductUrl(enrichedWebsite)) {
    console.log(`[Enricher] Rejected invalid URL as website for "${name}": ${enrichedWebsite}`);
    enrichedWebsite = null;
  }

  const hasRealData = nameMatches && !!(enrichedWebsite || metrics.revenue || metrics.funding || metrics.user_count || metrics.team_size || metrics.founded_year);

  const entityUpdates = { 'enrichment.web_verified': hasRealData };
  if (nameMatches && metrics.description) entityUpdates.description = metrics.description;

  const websiteForNameCheck = enrichedWebsite || entity.website_url;
  const fixedName = betterName(entity.name, entity.classification?.clean_name, metrics.matched_name, websiteForNameCheck);
  if (fixedName) {
    entityUpdates.name = fixedName;
    entityUpdates['classification.clean_name'] = fixedName;
    console.log(`[Enricher] Updated name "${entity.name}" → "${fixedName}"`);
  }

  if (enrichedWebsite) {
    const currentUrl = entity.website_url;
    const currentIsGood = currentUrl && isValidProductUrl(currentUrl);
    if (nameMatches) {
      entityUpdates.website_url = enrichedWebsite;
    } else if (!currentIsGood) {
      entityUpdates.website_url = enrichedWebsite;
      console.log(`[Enricher] Overriding bad URL for "${name}": ${currentUrl} → ${enrichedWebsite}`);
    }
  }

  await col('entities').updateOne(
    { _id: entity._id },
    { $set: entityUpdates },
  );

  const deadStatuses = new Set(['parked', 'for_sale', 'dead']);
  if (deadStatuses.has(metrics.domain_status)) {
    console.warn(`[Enricher] "${name}" domain is ${metrics.domain_status} — marking as not a startup`);
    await col('entities').updateOne(
      { _id: entity._id },
      { $set: { 'classification.is_startup': false, 'enrichment.domain_status': metrics.domain_status } },
    );
  }

  console.log(`[Enricher] Done: ${name} — rev=${metrics.revenue || 'n/a'}, fund=${metrics.funding || 'n/a'}, users=${metrics.user_count || 'n/a'}, domain=${metrics.domain_status || 'unknown'}`);
  return { entity_id: entity._id, name, metrics };
}

function levenshteinRatio(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

function buildResearchQuery(name, domain, description) {
  const domainHint = domain && !domain.startsWith('reddit-') ? ` (${domain})` : '';
  const descHint = description ? ` — ${description}` : '';
  return `Find the official website and company information for the AI startup "${name}"${domainHint}${descHint}. What is their website URL? Also find their current revenue or MRR, total funding raised, team size, user or customer count, growth metrics, and founding date. Include specific numbers and the official website URL.`;
}
