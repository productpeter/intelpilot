import { research } from '../lib/tabstack.js';
import { chatJson } from '../lib/openai.js';
import { col } from '../db/mongo.js';
import { isValidProductUrl } from './extractor.js';
import { startJob, updateJob, finishJob, failJob } from './progress.js';
import { betterName } from '../lib/namefix.js';

const EXTRACT_PROMPT = `You are a startup data extractor. Given research text about a startup/company, extract structured metrics, source URLs, and recent news. Respond with JSON:

{
  "matched_name": "The exact company/product name found in the research",
  "domain_status": "One of: active, parked, for_sale, dead, unknown",
  "revenue": "ACTUAL company revenue/MRR/ARR figure, e.g. '$50K MRR' or '$1.2M ARR', or null. Do NOT include product pricing like '$49/month' or '$99/year' — those are prices, not revenue",
  "revenue_source": "Third-party URL where the revenue data was published (e.g. TechCrunch article, Crunchbase page), or null",
  "funding": "Single string summary, e.g. '$2M seed from Y Combinator' or '$50M Series A', or null",
  "funding_source": "Third-party URL where the funding data was published, or null",
  "team_size": "Single string, e.g. '12 employees' or 'solo founder', or null",
  "team_size_source": "Third-party URL where team size data was published (e.g. LinkedIn, Crunchbase), or null",
  "user_count": "Single string, e.g. '10K users' or '500 customers', or null",
  "user_count_source": "Third-party URL where user/customer count was published, or null",
  "growth": "Single string, e.g. '30% MoM growth' or 'doubled in 3 months', or null",
  "growth_source": "Third-party URL where growth data was published, or null",
  "monthly_traffic": "Estimated monthly website visits from SimilarWeb or similar traffic analysis, e.g. '1.2M visits/month' or '50K monthly visitors', or null. Only use data from traffic analysis sources, do NOT guess.",
  "monthly_traffic_source": "SimilarWeb URL or other traffic analysis source URL, e.g. 'https://www.similarweb.com/website/example.com/', or null",
  "tech_stack": "Comma-separated list of key technologies, frameworks, or infrastructure, e.g. 'React, Python, AWS, PostgreSQL', or null",
  "tech_stack_source": "URL where tech stack info was found (e.g. StackShare, BuiltWith, company engineering blog, GitHub), or null",
  "founded_year": "Year as a string, e.g. '2024', or null",
  "description": "A concise 1-2 sentence description of what the company does",
  "website": "Primary website URL if found, or null",
  "notable": "Any notable facts (e.g. YC batch, notable customers, awards)",
  "notable_source": "Third-party URL where the notable fact was published, or null",
  "recent_news": [
    {
      "title": "Article headline",
      "url": "Full URL to the article",
      "date": "Publication date if available, e.g. '2025-01-15' or 'Jan 2025', or null",
      "summary": "One-sentence summary of the article"
    }
  ]
}

IMPORTANT:
- Every field except "recent_news" must be either null or a plain string. NEVER return objects or arrays for those fields.
- "recent_news" is an array of objects (up to 5 most recent). Return an empty array [] if no news articles are found.
- Only include data explicitly stated in the research. Do not guess or fabricate numbers.
- For _source fields: provide the EXACT URL from the research text where the data was cited. Source URLs should be articles, Crunchbase pages, LinkedIn, SimilarWeb, StackShare, blog posts, or press releases — NOT the company's bare homepage. A deep page on the company's site (e.g. /blog/funding-announcement) is acceptable, but their homepage (e.g. https://company.com/) is NOT a valid source. For monthly_traffic_source, use the SimilarWeb URL for that domain. NEVER fabricate or guess URLs. NEVER use example.com or placeholder URLs.
- For recent_news: only include real articles with actual URLs that appear in the research text. NEVER invent article URLs. If no real article URLs are found, return an empty array [].`;

const ENRICHMENT_CONCURRENCY = 20;

export async function enrichEntities(entities, jobName = 'enrich') {
  console.log(`[Enricher] Starting enrichment for ${entities.length} entities (job=${jobName})…`);
  const job = startJob(jobName);
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
        updateJob(jobName, { completed: job.completed, failed: job.failed });
      }
    }
    finishJob(jobName, `${results.length}/${entities.length} enriched`);
  } catch (err) {
    failJob(jobName, err.message);
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

  const NULL_STRINGS = new Set(['null', 'n/a', 'N/A', 'none', 'None', 'unknown', 'Unknown', '']);
  const allMetricKeys = ['revenue', 'revenue_source', 'funding', 'funding_source', 'team_size', 'team_size_source', 'user_count', 'user_count_source', 'growth', 'growth_source', 'monthly_traffic', 'monthly_traffic_source', 'tech_stack', 'tech_stack_source', 'founded_year', 'notable', 'notable_source', 'description', 'website'];
  for (const key of allMetricKeys) {
    const v = metrics[key];
    if (v && typeof v === 'object') {
      metrics[key] = v.total ? String(v.total) : JSON.stringify(v);
    }
    if (typeof metrics[key] === 'string' && NULL_STRINGS.has(metrics[key].trim())) {
      metrics[key] = null;
    }
  }

  const FAKE_URL_PATTERNS = /example\.com|placeholder|fake|localhost|127\.0\.0\.1|test\.com/i;

  function isRealUrl(url) {
    return url && typeof url === 'string' && url.startsWith('http') && !FAKE_URL_PATTERNS.test(url);
  }

  const ownDomains = new Set();
  if (domain && !domain.startsWith('reddit-')) ownDomains.add(domain.toLowerCase().replace(/^www\./, ''));
  if (metrics.website) {
    try { ownDomains.add(new URL(metrics.website).hostname.toLowerCase().replace(/^www\./, '')); } catch {}
  }
  if (entity.website_url) {
    try { ownDomains.add(new URL(entity.website_url).hostname.toLowerCase().replace(/^www\./, '')); } catch {}
  }

  function isNotBareHomepage(url) {
    if (!isRealUrl(url)) return false;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const path = parsed.pathname.replace(/\/+$/, '');
      if (ownDomains.has(host) && (!path || path === '')) return false;
      return true;
    } catch { return false; }
  }

  for (const key of allMetricKeys) {
    if (key.endsWith('_source') && metrics[key] && !isNotBareHomepage(metrics[key])) {
      metrics[key] = null;
    }
  }

  const recentNews = Array.isArray(metrics.recent_news)
    ? metrics.recent_news
        .filter((n) => n && typeof n === 'object' && n.title && isRealUrl(n.url))
        .slice(0, 5)
        .map((n) => ({
          title: String(n.title || '').slice(0, 200),
          url: String(n.url),
          date: n.date || null,
          summary: n.summary ? String(n.summary).slice(0, 300) : null,
        }))
    : [];
  delete metrics.recent_news;

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
    recent_news: recentNews,
    name_matched: nameMatches,
    enriched_at: new Date(),
  };

  await col('entities').updateOne(
    { _id: entity._id },
    { $set: { enrichment } },
  );

  const signalMap = {
    revenue: { type: 'revenue_claim', sourceKey: 'revenue_source' },
    funding: { type: 'funding_raised', sourceKey: 'funding_source' },
    user_count: { type: 'user_count', sourceKey: 'user_count_source' },
    team_size: { type: 'team_size', sourceKey: 'team_size_source' },
    growth: { type: 'growth_rate', sourceKey: 'growth_source' },
    monthly_traffic: { type: 'web_traffic', sourceKey: 'monthly_traffic_source' },
  };

  for (const [field, { type: signalType, sourceKey }] of Object.entries(signalMap)) {
    if (nameMatches && metrics[field] && typeof metrics[field] === 'string') {
      const sourceUrl = metrics[sourceKey] || null;

      let evidenceId = null;
      if (sourceUrl && isNotBareHomepage(sourceUrl)) {
        const evidenceDoc = {
          url: sourceUrl,
          type: signalType,
          snippet: metrics[field],
          entity_id: entity._id,
          created_at: new Date(),
        };
        const inserted = await col('evidence').insertOne(evidenceDoc);
        evidenceId = inserted.insertedId;
      }

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
          evidence_id: evidenceId,
          source_id: null,
          captured_at: new Date(),
          enriched: true,
        });
      } else if (evidenceId && !existing.evidence_id) {
        await col('signals').updateOne(
          { _id: existing._id },
          { $set: { evidence_id: evidenceId } },
        );
      }
    }
  }

  if (metrics.notable && metrics.notable_source && isNotBareHomepage(metrics.notable_source)) {
    await col('evidence').insertOne({
      url: metrics.notable_source,
      type: 'notable',
      snippet: metrics.notable,
      entity_id: entity._id,
      created_at: new Date(),
    });
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

  const hasRealData = nameMatches && !!(enrichedWebsite || metrics.revenue || metrics.funding || metrics.user_count || metrics.team_size || metrics.monthly_traffic || metrics.founded_year);

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
  return `Find the official website and company information for the AI startup "${name}"${domainHint}${descHint}. What is their website URL? Also find their current revenue or MRR, total funding raised, team size, user or customer count, growth metrics, and founding date. Include specific numbers and the official website URL. Check SimilarWeb for their estimated monthly website traffic. Check StackShare, BuiltWith, or their GitHub/engineering blog for their tech stack. For every metric you find, include the source URL where that information was published (articles, Crunchbase, SimilarWeb, StackShare — not just the company homepage). Also find the most recent news articles, blog posts, or press coverage about this company — include the article title, URL, date, and a brief summary for each.`;
}
