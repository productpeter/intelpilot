import { col } from '../db/mongo.js';
import { isValidProductUrl } from './extractor.js';
import { startJob, updateJob, finishJob } from './progress.js';

export async function generateWeeklyReport() {
  const now = new Date();
  const fallback = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  console.log('[Reports] Generating new discoveries report…');
  const job = startJob('report');
  updateJob('report', { message: 'Finding cutoff from last report…' });

  const lastReport = await col('reports')
    .findOne({}, { sort: { generated_at: -1 }, projection: { generated_at: 1 } });
  const cutoff = lastReport?.generated_at || fallback;

  console.log(`[Reports] Cutoff: ${cutoff.toISOString()}`);
  updateJob('report', { message: 'Loading new entities…' });

  const entities = await col('entities')
    .find({
      created_at: { $gte: cutoff },
      'classification.is_startup': true,
      'classification.clean_name': { $ne: null },
    })
    .sort({ created_at: -1 })
    .toArray();

  console.log(`[Reports] Found ${entities.length} new startups since ${cutoff.toISOString()}`);

  if (entities.length === 0) {
    console.log('[Reports] No new startups — skipping report generation');
    finishJob('report', 'No new startups to report');
    return { items: [], stats: { entities_in_report: 0 } };
  }

  updateJob('report', { message: `Building report for ${entities.length} entities…` });

  const reportItems = [];

  for (const entity of entities) {
    const discoveries = await col('discoveries')
      .find({ entity_id: entity._id })
      .sort({ discovered_at: -1 })
      .limit(20)
      .toArray();

    const sourceLabels = buildSourceLabels(discoveries);

    const signals = await col('signals')
      .find({ entity_id: entity._id })
      .sort({ captured_at: -1 })
      .limit(30)
      .toArray();

    const evidenceIds = [...new Set(signals.map((s) => s.evidence_id).filter(Boolean))];
    const evidenceDocs = evidenceIds.length
      ? await col('evidence').find({ _id: { $in: evidenceIds } }).toArray()
      : [];

    const pick = (type) => {
      const found = signals.filter((s) => s.signal_type === type);
      return found.length ? [...new Set(found.map((s) => s.value_text))].join('; ') : null;
    };

    const em = entity.enrichment?.metrics;
    const category = entity.classification?.category;
    const firstDiscovery = discoveries.length
      ? discoveries[discoveries.length - 1].discovered_at
      : entity.created_at;

    reportItems.push({
      entity_id: entity._id,
      entity_name: entity.name,
      domain: entity.canonical_domain,
      description: entity.description,
      tags: (entity.tags || []).filter(Boolean),
      category,
      revenue: pick('revenue_claim') || em?.revenue,
      funding: pick('funding_raised') || em?.funding,
      growth: pick('growth_rate') || em?.growth,
      users: pick('user_count') || pick('customer_count_claim') || em?.user_count,
      team: pick('team_size') || em?.team_size,
      notable: em?.notable || null,
      website: resolveReportWebsite(entity, em, evidenceDocs),
      source_labels: sourceLabels,
      discovered_at: firstDiscovery,
      signals: signals.map((s) => ({
        type: s.signal_type,
        value: s.value_text,
        confidence: s.confidence,
      })),
      evidence: evidenceDocs.slice(0, 3).map((e) => ({
        url: e.url,
        snippet: e.snippet,
        type: e.type,
      })),
    });
  }

  updateJob('report', { message: `Building HTML for ${reportItems.length} items…` });

  const reportJson = { period_start: cutoff, period_end: now, items: reportItems };
  const reportHtml = buildReportHtml(reportJson);

  const scanRuns = await col('scan_runs')
    .find({ started_at: { $gte: cutoff } })
    .toArray();

  const stats = {
    entities_in_report: reportItems.length,
    total_entities_updated: entities.length,
    scans_completed: scanRuns.filter((r) => r.status === 'success').length,
    scans_failed: scanRuns.filter((r) => r.status === 'fail').length,
  };

  const report = {
    period_start: cutoff,
    period_end: now,
    generated_at: new Date(),
    items: reportItems,
    report_json: reportJson,
    report_html: reportHtml,
    stats,
  };

  const { insertedId } = await col('reports').insertOne(report);
  console.log(`[Reports] Report generated: ${insertedId} (${reportItems.length} items)`);
  finishJob('report', `${reportItems.length} new startups in report`);
  return report;
}

function buildSourceLabels(discoveries) {
  const labels = new Set();
  for (const d of discoveries) {
    const meta = d.meta || {};
    if (meta.subreddit) {
      labels.add(`r/${meta.subreddit}`);
    } else if (meta.feed_label) {
      labels.add(meta.feed_label);
    } else if (meta.source_page) {
      labels.add(meta.source_page);
    } else {
      const url = d.candidate_url || '';
      if (url.includes('producthunt.com')) labels.add('Product Hunt');
      else if (url.includes('news.ycombinator.com')) labels.add('Hacker News');
      else if (url.includes('betalist.com')) labels.add('BetaList');
      else if (url.includes('techcrunch.com')) labels.add('TechCrunch');
      else if (url.includes('futuretools.io')) labels.add('FutureTools');
      else if (url.includes('toolify.ai')) labels.add('Toolify');
      else if (url.includes('aitools.fyi')) labels.add('AITools.fyi');
      else if (url.includes('reddit.com')) labels.add('Reddit');
    }
  }
  return [...labels];
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

  const fmtFull = (d) =>
    new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const itemsHtml = items
    .map((item) => {
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

      const sourceBadges = (item.source_labels || [])
        .map((s) => `<span class="source">${esc(s)}</span>`)
        .join(' ');

      return `
      <div class="card">
        <div class="card-hd">
          <h3>${websiteUrl ? `<a href="${esc(websiteUrl)}" target="_blank">${esc(item.entity_name)}</a>` : esc(item.entity_name)}</h3>
          ${item.category ? `<span class="category">${esc(item.category)}</span>` : ''}
        </div>
        ${sourceBadges ? `<div class="sources">${sourceBadges}</div>` : ''}
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
        <div class="meta">Discovered ${fmtFull(item.discovered_at)}</div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IntelPilot — New AI Startup Discoveries</title>
<style>
:root{
  --bg:#0a0a0f;--surface:#12121a;--surface-2:#1a1a26;--surface-3:#222233;
  --border:#2a2a3a;--border-light:#33334a;--text:#e8e8f0;--text-dim:#8888a0;--text-muted:#55556a;
  --accent:#6366f1;--accent-dim:rgba(99,102,241,.15);
  --green:#22c55e;--green-dim:rgba(34,197,94,.12);
  --yellow:#eab308;--yellow-dim:rgba(234,179,8,.12);
  --red:#ef4444;--red-dim:rgba(239,68,68,.12);
  --blue:#3b82f6;--blue-dim:rgba(59,130,246,.12);
  --purple:#a855f7;--purple-dim:rgba(168,85,247,.12);
  --cyan:#06b6d4;
  --radius:10px;--radius-sm:6px;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
.wrap{max-width:960px;margin:0 auto;padding:2rem 1.25rem}
header{background:var(--surface-2);border:1px solid var(--border);padding:2rem 2rem 1.5rem;border-radius:var(--radius);margin-bottom:1.5rem;position:relative;overflow:hidden}
header::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--cyan),var(--purple))}
header h1{font-size:1.6rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.25rem}
header .subtitle{color:var(--text-dim);font-size:.88rem}
header .stat{display:inline-block;margin-top:.75rem;padding:.3rem .8rem;background:var(--accent-dim);color:var(--accent);border-radius:20px;font-size:.82rem;font-weight:600}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;margin-bottom:.75rem;transition:border-color .15s}
.card:hover{border-color:var(--border-light)}
.card-hd{display:flex;align-items:baseline;gap:.75rem;flex-wrap:wrap;margin-bottom:.5rem}
.card-hd h3{font-size:1.05rem;font-weight:600;color:var(--text)}
.card-hd h3 a{color:var(--accent);text-decoration:none;transition:color .15s}
.card-hd h3 a:hover{color:#818cf8}
.sources{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:.5rem}
.source{background:var(--green-dim);color:var(--green);padding:2px 10px;border-radius:12px;font-size:.72rem;font-weight:600;border:1px solid rgba(34,197,94,.2)}
.category{background:var(--purple-dim);color:var(--purple);padding:2px 8px;border-radius:12px;font-size:.74rem;font-weight:500;border:1px solid rgba(168,85,247,.2)}
.website{margin-bottom:.5rem}
.website a{color:var(--blue);font-size:.82rem;text-decoration:none;opacity:.8;transition:opacity .15s}
.website a:hover{opacity:1;text-decoration:underline}
.notable{color:var(--text-dim);font-size:.84rem;font-style:italic;margin-bottom:.6rem;padding-left:.5rem;border-left:2px solid var(--border-light)}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:.6rem}
.badge{padding:4px 12px;border-radius:var(--radius-sm);font-size:.8rem;font-weight:600;display:inline-block;border:1px solid transparent}
.revenue{background:rgba(234,179,8,.1);color:var(--yellow);border-color:rgba(234,179,8,.2)}
.funding{background:var(--blue-dim);color:var(--blue);border-color:rgba(59,130,246,.2)}
.users{background:rgba(6,182,212,.1);color:var(--cyan);border-color:rgba(6,182,212,.2)}
.growth{background:var(--red-dim);color:var(--red);border-color:rgba(239,68,68,.2)}
.team{background:var(--purple-dim);color:var(--purple);border-color:rgba(168,85,247,.2)}
.desc{color:var(--text-dim);font-size:.88rem;margin-bottom:.6rem;line-height:1.5}
.tags{margin-bottom:.6rem}
.tag{display:inline-block;background:var(--surface-3);color:var(--text-dim);padding:2px 10px;border-radius:12px;font-size:.74rem;margin:2px;border:1px solid var(--border)}
details{margin-bottom:.4rem}
summary{font-weight:600;font-size:.85rem;cursor:pointer;color:var(--text-dim);padding:.3rem 0;transition:color .15s}
summary:hover{color:var(--text)}
details ul{padding:.5rem 0 .5rem .25rem}
ul{list-style:none;padding-left:0;font-size:.85rem}
li{padding:4px 0;color:var(--text-dim);border-bottom:1px solid var(--border);line-height:1.45}
li:last-child{border-bottom:none}
.conf{color:var(--text-muted);font-size:.76rem}
a{color:var(--blue);text-decoration:none}
a:hover{text-decoration:underline}
em{color:var(--text-muted);font-size:.82rem}
.meta{margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border);font-size:.78rem;color:var(--text-muted)}
footer{text-align:center;color:var(--text-muted);font-size:.8rem;margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--border)}
.empty{text-align:center;padding:3rem 1rem;color:var(--text-dim);font-size:.95rem}
@media(max-width:640px){
  .wrap{padding:1rem .75rem}
  header{padding:1.25rem}
  .card{padding:1rem}
  .badges{gap:4px}
}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>New AI Startup Discoveries</h1>
    <p class="subtitle">Since ${fmt(period_start)}</p>
    <span class="stat">${items.length} new startup${items.length !== 1 ? 's' : ''} found</span>
  </header>
  ${itemsHtml || '<p class="empty">No new startups discovered since last report.</p>'}
  <footer>Generated by IntelPilot · ${fmt(new Date())}</footer>
</div>
</body>
</html>`;
}

function esc(s) {
  if (!s) return '';
  const str = typeof s === 'string' ? s : String(s);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
