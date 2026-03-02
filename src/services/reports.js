import { col } from '../db/mongo.js';
import { enrichEntities } from './enricher.js';
import { isAggregatorUrl, isValidProductUrl } from './extractor.js';
import { startJob, updateJob, finishJob, failJob } from './progress.js';

const SIGNAL_WEIGHTS = {
  revenue_claim: 25,
  funding_raised: 20,
  growth_rate: 15,
  customer_count_claim: 10,
  user_count: 10,
  team_size: 5,
  pricing_present: 7,
  launch_announcement: 4,
  trend_indicator: 1,
};



export async function generateWeeklyReport() {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  console.log('[Reports] Generating weekly report…');
  const job = startJob('report');
  updateJob('report', { message: 'Loading entities…' });

  const entities = await col('entities')
    .find({
      updated_at: { $gte: oneWeekAgo },
      'classification.is_startup': true,
      'classification.clean_name': { $ne: null },
    })
    .sort({ updated_at: -1 })
    .limit(500)
    .toArray();

  const scoredItems = [];

  for (const entity of entities) {
    const signals = await col('signals')
      .find({ entity_id: entity._id, captured_at: { $gte: oneWeekAgo } })
      .toArray();

    const evidenceIds = [...new Set(signals.map((s) => s.evidence_id).filter(Boolean))];
    const evidenceDocs = evidenceIds.length
      ? await col('evidence').find({ _id: { $in: evidenceIds } }).toArray()
      : [];

    const sourceCount = new Set(signals.map((s) => s.source_id?.toString())).size;

    const hasRevenue = signals.some((s) => s.signal_type === 'revenue_claim');

    let score = 0;
    for (const sig of signals) {
      score += (SIGNAL_WEIGHTS[sig.signal_type] || 1) * sig.confidence;
    }
    if (hasRevenue) score += 100;
    score += sourceCount * 3;
    const daysSinceUpdate = (now - entity.updated_at) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 7 - daysSinceUpdate);

    const avgConfidence = signals.length
      ? signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length
      : 0;

    const hasRealDomain = entity.canonical_domain && !entity.canonical_domain.startsWith('reddit-');
    const hasWebsite = !!entity.website_url;
    const webVerified = entity.enrichment?.web_verified === true;
    const enrichedButEmpty = entity.enrichment && !webVerified;

    if (enrichedButEmpty && !hasWebsite && !hasRealDomain) {
      score *= 0.1;
    }

    scoredItems.push({ entity, signals, evidence: evidenceDocs, score, sourceCount, avgConfidence, hasRevenue });
  }

  updateJob('report', { message: `Scored ${scoredItems.length} entities, ranking…` });

  scoredItems.sort((a, b) => {
    if (a.hasRevenue !== b.hasRevenue) return a.hasRevenue ? -1 : 1;
    return b.score - a.score;
  });

  const toEnrich = scoredItems
    .filter((item) => !item.entity.enrichment)
    .map((item) => item.entity);

  if (toEnrich.length > 0) {
    console.log(`[Reports] Awaiting enrichment for ${toEnrich.length} entities…`);
    updateJob('report', { message: `Enriching ${toEnrich.length} entities…` });
    await enrichEntities(toEnrich);

    for (const item of scoredItems) {
      const fresh = await col('entities').findOne({ _id: item.entity._id });
      if (fresh) item.entity = fresh;
    }
  }

  const reportReady = scoredItems.filter((item) => {
    const entity = item.entity;
    const hasWebsite = !!entity.website_url && isValidProductUrl(entity.website_url);
    const hasEnrichmentWebsite = entity.enrichment?.metrics?.website &&
      isValidProductUrl(entity.enrichment.metrics.website.startsWith('http') ? entity.enrichment.metrics.website : `https://${entity.enrichment.metrics.website}`);
    const hasRealDomain = entity.canonical_domain && !entity.canonical_domain.startsWith('reddit-') && entity.canonical_domain.includes('.');
    if (hasWebsite || hasEnrichmentWebsite || hasRealDomain) return true;
    if (entity.enrichment && !hasWebsite && !hasEnrichmentWebsite && !hasRealDomain) {
      console.log(`[Reports] Excluding "${entity.name}" — enriched but no discoverable website`);
      return false;
    }
    return true;
  });

  const topItems = reportReady.slice(0, 50);

  const reportItems = topItems.map((item) => {
    const pick = (type) => {
      const found = item.signals.filter((s) => s.signal_type === type);
      return found.length ? [...new Set(found.map((s) => s.value_text))].join('; ') : null;
    };

    const em = item.entity.enrichment?.metrics;
    const category = item.entity.classification?.category;

    return {
      entity_id: item.entity._id,
      entity_name: item.entity.name,
      domain: item.entity.canonical_domain,
      description: item.entity.description,
      tags: item.entity.tags,
      category,
      revenue: pick('revenue_claim') || em?.revenue,
      funding: pick('funding_raised') || em?.funding,
      growth: pick('growth_rate') || em?.growth,
      users: pick('user_count') || pick('customer_count_claim') || em?.user_count,
      team: pick('team_size') || em?.team_size,
      notable: em?.notable || null,
      website: resolveReportWebsite(item.entity, em, item.evidence),
      score: Math.round(item.score * 100) / 100,
      source_count: item.sourceCount,
      avg_confidence: Math.round(item.avgConfidence * 100) / 100,
      signals: item.signals.map((s) => ({
        type: s.signal_type,
        value: s.value_text,
        confidence: s.confidence,
      })),
      evidence: item.evidence.slice(0, 3).map((e) => ({
        url: e.url,
        snippet: e.snippet,
        type: e.type,
      })),
    };
  });

  updateJob('report', { message: `Building HTML for ${reportItems.length} items…` });

  const reportJson = { period_start: oneWeekAgo, period_end: now, items: reportItems };
  const reportHtml = buildReportHtml(reportJson);

  const scanRuns = await col('scan_runs')
    .find({ started_at: { $gte: oneWeekAgo } })
    .toArray();

  const stats = {
    entities_in_report: reportItems.length,
    total_entities_updated: entities.length,
    scans_completed: scanRuns.filter((r) => r.status === 'success').length,
    scans_failed: scanRuns.filter((r) => r.status === 'fail').length,
  };

  const report = {
    period_start: oneWeekAgo,
    period_end: now,
    generated_at: new Date(),
    items: reportItems,
    report_json: reportJson,
    report_html: reportHtml,
    stats,
  };

  const { insertedId } = await col('reports').insertOne(report);
  console.log(`[Reports] Report generated: ${insertedId} (${reportItems.length} items)`);
  finishJob('report', `${reportItems.length} startups in report`);
  return report;
}

function resolveReportWebsite(entity, enrichmentMetrics, evidenceDocs) {
  const candidates = [
    entity.website_url,
    enrichmentMetrics?.website,
    entity.canonical_domain && !entity.canonical_domain.startsWith('reddit-')
      ? `https://${entity.canonical_domain}`
      : null,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    if (isValidProductUrl(url)) return url;
  }

  for (const ev of evidenceDocs || []) {
    if (ev.url && isValidProductUrl(ev.url)) {
      return ev.url;
    }
  }

  return null;
}

// ── HTML builder ────────────────────────────────────────────────────

function buildReportHtml(reportJson) {
  const { period_start, period_end, items } = reportJson;
  const fmt = (d) =>
    new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const itemsHtml = items
    .map((item, i) => {
      const signalsHtml = item.signals
        .map(
          (s) =>
            `<li><strong>${esc(s.type)}</strong>: ${esc(s.value)} <span class="conf">(${Math.round(s.confidence * 100)}%)</span></li>`,
        )
        .join('');

      const evidenceHtml = item.evidence
        .map(
          (e) =>
            `<li><a href="${esc(e.url)}" target="_blank">${esc(e.url)}</a><br><em>${esc((e.snippet || '').slice(0, 200))}</em></li>`,
        )
        .join('');

      const websiteUrl = item.website && !item.website.startsWith('reddit-')
        ? (item.website.startsWith('http') ? item.website : `https://${item.website}`)
        : null;

      return `
      <div class="card">
        <div class="card-hd">
          <h3>${i + 1}. ${websiteUrl ? `<a href="${esc(websiteUrl)}" target="_blank">${esc(item.entity_name)}</a>` : esc(item.entity_name)}</h3>
          ${item.category ? `<span class="category">${esc(item.category)}</span>` : ''}
          <span class="score">Score ${item.score}</span>
        </div>
        ${websiteUrl ? `<div class="website"><a href="${esc(websiteUrl)}" target="_blank">${esc(websiteUrl)}</a></div>` : ''}
        <div class="badges">
        ${item.revenue ? `<span class="badge revenue">Revenue: ${esc(item.revenue)}</span>` : ''}
        ${item.funding ? `<span class="badge funding">Funding: ${esc(item.funding)}</span>` : ''}
        ${item.users ? `<span class="badge users">Users: ${esc(item.users)}</span>` : ''}
        ${item.growth ? `<span class="badge growth">Growth: ${esc(item.growth)}</span>` : ''}
        ${item.team ? `<span class="badge team">Team: ${esc(item.team)}</span>` : ''}
        </div>
        <p class="desc">${esc(item.description || 'No description')}</p>
        ${item.notable ? `<p class="notable">${esc(item.notable)}</p>` : ''}
        ${item.tags?.length ? `<div class="tags">${item.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>` : ''}
        <details><summary>Signals</summary><ul>${signalsHtml || '<li>None</li>'}</ul></details>
        <details><summary>Evidence</summary><ul>${evidenceHtml || '<li>None</li>'}</ul></details>
        <div class="meta">Sources: ${item.source_count} · Avg confidence: ${Math.round(item.avg_confidence * 100)}%</div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IntelPilot Weekly Report</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f5f7;color:#1a1a2e;line-height:1.6}
.wrap{max-width:920px;margin:0 auto;padding:2rem 1rem}
header{background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:2rem;border-radius:12px;margin-bottom:2rem}
header h1{font-size:1.75rem;margin-bottom:.25rem}
header p{opacity:.8;font-size:.95rem}
.card{background:#fff;border-radius:10px;padding:1.5rem;margin-bottom:1rem;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.card-hd{display:flex;align-items:baseline;gap:.75rem;flex-wrap:wrap;margin-bottom:.4rem}
.card-hd h3{font-size:1.1rem;color:#1a1a2e}
.domain{color:#666;font-size:.82rem}
.score{background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:12px;font-size:.78rem;font-weight:600}
.category{background:#ede7f6;color:#4527a0;padding:2px 8px;border-radius:12px;font-size:.76rem;font-weight:500}
.website{margin-bottom:.5rem}.website a{color:#1976d2;font-size:.84rem}
.notable{color:#666;font-size:.85rem;font-style:italic;margin-bottom:.6rem}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:.6rem}
.badge{padding:4px 12px;border-radius:8px;font-size:.82rem;font-weight:600;display:inline-block}
.revenue{background:#fff3e0;color:#e65100}
.funding{background:#e8eaf6;color:#283593}
.users{background:#e0f2f1;color:#00695c}
.growth{background:#fce4ec;color:#c62828}
.team{background:#f3e5f5;color:#6a1b9a}
.desc{color:#555;margin-bottom:.6rem}
.tags{margin-bottom:.6rem}
.tag{display:inline-block;background:#e3f2fd;color:#1565c0;padding:2px 10px;border-radius:12px;font-size:.76rem;margin:2px}
details{margin-bottom:.4rem}
summary{font-weight:600;font-size:.88rem;cursor:pointer;color:#444}
ul{list-style:none;padding-left:0;font-size:.88rem}
li{padding:3px 0}
.conf{color:#999;font-size:.78rem}
a{color:#1976d2;text-decoration:none}
em{color:#777;font-size:.84rem}
.meta{margin-top:.6rem;padding-top:.6rem;border-top:1px solid #eee;font-size:.8rem;color:#888}
footer{text-align:center;color:#aaa;font-size:.82rem;margin-top:2rem}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>IntelPilot Weekly Intelligence Report</h1>
    <p>${fmt(period_start)} – ${fmt(period_end)} · ${items.length} entities tracked</p>
  </header>
  ${itemsHtml || '<p>No items this week.</p>'}
  <footer>Generated by IntelPilot on ${fmt(new Date())}</footer>
</div>
</body>
</html>`;
}

function esc(s) {
  if (!s) return '';
  const str = typeof s === 'string' ? s : String(s);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
