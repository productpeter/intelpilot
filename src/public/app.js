const $ = (sel) => document.querySelector(sel);

const PAGE_SIZE = 24;
let currentPage = 1;
let allEntities = [];
let currentSort = 'revenue_first';
let currentCategory = '';
let searchQuery = '';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtFull(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function truncDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 30);
  }
}

function setFeedback(text, type) {
  const el = $('#nav-feedback');
  el.textContent = text || '';
  el.className = 'nav-feedback ' + (type || '');
}

async function api(method, path, body) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function checkHealth() {
  try {
    await api('GET', '/health');
    $('.pulse').classList.add('online');
    $('.pulse').classList.remove('offline');
    $('.status-text').textContent = 'Online';
  } catch {
    $('.pulse').classList.add('offline');
    $('.pulse').classList.remove('online');
    $('.status-text').textContent = 'Offline';
  }
}

async function loadEntities() {
  const grid = $('#entity-grid');
  try {
    const apiSort = currentSort === 'revenue_first' ? 'updated_at' : currentSort;
    const res = await api('GET', `/entities?sort=${apiSort}&order=desc&limit=1000&skip=0`);
    allEntities = res.data || [];
    populateCategories(allEntities);
    renderEntities();
  } catch {
    grid.innerHTML = '<div class="grid-empty">Failed to load entities.</div>';
  }
}

function populateCategories(entities) {
  const cats = new Set();
  for (const e of entities) {
    if (e.classification?.category) cats.add(e.classification.category);
  }
  const sel = $('#filter-category');
  const current = sel.value;
  const opts = ['<option value="">All Categories</option>'];
  for (const c of [...cats].sort()) {
    opts.push(`<option value="${c}"${c === current ? ' selected' : ''}>${c}</option>`);
  }
  sel.innerHTML = opts.join('');
}

const PRICING_RE = /^\$?\d[\d,.]*\s*\/\s*(?:mo|month|year|yr|user|seat)/i;
const BARE_PRICE_RE = /^\$?\d{1,3}(?:\.\d{2})?\s*$/;
function isPricing(val) {
  if (typeof val !== 'string') return false;
  const v = val.trim();
  if (PRICING_RE.test(v)) return true;
  if (BARE_PRICE_RE.test(v)) return true;
  return false;
}

function hasRevenue(e) {
  const rev = e.enrichment?.metrics?.revenue;
  return !!(rev && !isPricing(rev));
}

function hasFunding(e) {
  return !!(e.enrichment?.metrics?.funding);
}

function hasAnyMetric(e) {
  const m = e.enrichment?.metrics;
  return !!(m && (m.revenue || m.funding || m.user_count || m.team_size));
}

function getFiltered() {
  let filtered = allEntities;

  if (currentCategory) {
    filtered = filtered.filter((e) => e.classification?.category === currentCategory);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((e) =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.enrichment?.metrics?.matched_name || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q) ||
      (e.classification?.one_liner || '').toLowerCase().includes(q) ||
      (e.classification?.category || '').toLowerCase().includes(q),
    );
  }

  if (currentSort === 'revenue_first') {
    filtered = [...filtered].sort((a, b) => {
      const ra = hasRevenue(a) ? 3 : hasFunding(a) ? 2 : hasAnyMetric(a) ? 1 : 0;
      const rb = hasRevenue(b) ? 3 : hasFunding(b) ? 2 : hasAnyMetric(b) ? 1 : 0;
      if (rb !== ra) return rb - ra;
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });
  }

  return filtered;
}

function renderEntities() {
  const grid = $('#entity-grid');
  const filtered = getFiltered();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  $('#entity-count').textContent = `${total} startup${total !== 1 ? 's' : ''}`;

  const isHome = currentPage === 1;
  const hero = document.querySelector('.hero-heading');
  const viz = document.querySelector('.cluster-viz-wrap');
  const chatBar = document.getElementById('chat-bar');
  if (hero) hero.style.display = isHome ? '' : 'none';
  if (viz) viz.style.display = isHome ? '' : 'none';
  if (chatBar) chatBar.style.display = isHome ? '' : 'none';

  if (!page.length) {
    grid.innerHTML = '<div class="grid-empty">No startups found.</div>';
    $('#pagination').innerHTML = '';
    return;
  }

  grid.innerHTML = page.map((e) => renderCard(e)).join('');
  renderPagination(totalPages);

  grid.querySelectorAll('.entity-card').forEach((card) => {
    card.addEventListener('click', (ev) => {
      if (ev.target.closest('a')) return;
      openEntityModal(card.dataset.id);
    });
  });
}

function shortNum(n) {
  if (n >= 1e12) return `${+(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function metricStr(val) {
  if (!val) return null;
  if (typeof val === 'string' && (val === 'null' || val === 'N/A' || val === 'n/a' || val === 'unknown' || val === 'none' || val === 'None')) return null;
  if (typeof val === 'number') {
    return shortNum(val);
  }
  if (typeof val === 'string') {
    return val.replace(/(?<!\.)(\d{7,})(?!\.\d)/g, (_, digits) => {
      return shortNum(parseInt(digits, 10));
    });
  }
  if (typeof val === 'object') {
    const raw = val.total != null ? val.total : JSON.stringify(val).slice(0, 60);
    return metricStr(raw);
  }
  return String(val);
}

function bestName(e) {
  const clean = e.classification?.clean_name || '';
  const raw = e.name || '';
  const researched = e.enrichment?.metrics?.matched_name || '';
  const isGeneric = (n) => /^(AI |An AI |The )/i.test(n) || n.length > 30;
  if (clean && !isGeneric(clean)) return clean;
  if (researched && !isGeneric(researched)) return researched;
  if (raw && !isGeneric(raw)) return raw;
  return researched || clean || raw || 'Unknown';
}

function renderCard(e) {
  const name = bestName(e);
  const category = e.classification?.category || '';
  const desc = e.classification?.one_liner || e.description || '';
  const url = e.website_url;
  const domain = truncDomain(url);
  const metrics = e.enrichment?.metrics || {};
  const enriched = !!e.enrichment;
  const verified = e.enrichment?.web_verified;

  const rawRev = metricStr(metrics.revenue);
  const rev = rawRev && !isPricing(rawRev) ? rawRev : null;
  const fund = metricStr(metrics.funding);
  const users = metricStr(metrics.user_count);
  const team = metricStr(metrics.team_size);
  const traffic = metricStr(metrics.monthly_traffic);

  let metricBadges = '';
  if (rev) metricBadges += `<span class="metric-badge revenue">💰 ${escHtml(rev)}</span>`;
  if (fund) metricBadges += `<span class="metric-badge funding">🚀 ${escHtml(fund)}</span>`;
  if (traffic) metricBadges += `<span class="metric-badge traffic">📊 ${escHtml(traffic)}</span>`;
  if (users) metricBadges += `<span class="metric-badge users">👥 ${escHtml(users)}</span>`;
  if (team) metricBadges += `<span class="metric-badge team">🧑‍💻 ${escHtml(team)}</span>`;

  return `
    <div class="entity-card" data-id="${e._id}">
      <div class="card-header">
        <span class="card-name">${escHtml(name)}</span>
        ${category ? `<span class="card-category">${escHtml(category)}</span>` : ''}
      </div>
      ${desc ? `<p class="card-desc">${escHtml(desc)}</p>` : ''}
      ${metricBadges ? `<div class="card-metrics">${metricBadges}</div>` : ''}
      <div class="card-footer">
        ${domain ? `<a href="${escAttr(url)}" target="_blank" rel="noopener" class="card-url">${escHtml(domain)}</a>` : '<span class="card-url" style="opacity:0.3">No website</span>'}
        <div class="card-badges">
          ${verified ? '<span class="badge-verified">Verified</span>' : ''}
          <span class="badge-enriched ${enriched ? 'yes' : 'no'}">${enriched ? 'Enriched' : 'Raw'}</span>
        </div>
      </div>
    </div>
  `;
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    $('#pagination').innerHTML = '';
    return;
  }

  let html = `<button class="page-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;

  const range = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
      range.push(i);
    } else if (range[range.length - 1] !== '…') {
      range.push('…');
    }
  }

  for (const p of range) {
    if (p === '…') {
      html += '<span class="page-btn" style="border:none;cursor:default;">…</span>';
    } else {
      html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
  }

  html += `<button class="page-btn" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;

  const pag = $('#pagination');
  pag.innerHTML = html;
  pag.querySelectorAll('.page-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p >= 1 && p <= totalPages) {
        currentPage = p;
        renderEntities();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

async function openEntityModal(id) {
  const overlay = $('#modal-overlay');
  const body = $('#modal-body');
  overlay.hidden = false;
  body.innerHTML = '<p class="muted">Loading…</p>';

  try {
    const e = await api('GET', `/entities/${id}`);
    const name = bestName(e);
    const category = e.classification?.category || '';
    const desc = e.description || e.classification?.one_liner || '';
    const url = e.website_url;
    const metrics = e.enrichment?.metrics || {};
    const signals = e.signals || [];
    const evidence = e.evidence || [];
    const discoveries = e.discoveries || [];
    const conf = e.classification?.confidence;

    let metricsHtml = '';
    const rawRevModal = metricStr(metrics.revenue);
    const metricFields = [
      ['Revenue', rawRevModal && !isPricing(rawRevModal) ? rawRevModal : null, metrics.revenue_source],
      ['Funding', metricStr(metrics.funding), metrics.funding_source],
      ['Traffic', metricStr(metrics.monthly_traffic), metrics.monthly_traffic_source],
      ['Users', metricStr(metrics.user_count), metrics.user_count_source],
      ['Team Size', metricStr(metrics.team_size), metrics.team_size_source],
      ['Growth', metricStr(metrics.growth), metrics.growth_source],
      ['Founded', metricStr(metrics.founded_year), null],
    ];
    const filled = metricFields.filter(([, v]) => v);
    if (filled.length) {
      metricsHtml = `
        <div class="modal-section">
          <h3>Metrics</h3>
          <div class="metrics-grid">
            ${filled.map(([l, v, src]) => {
              const srcLink = src ? `<a href="${escAttr(src)}" target="_blank" rel="noopener" class="evidence-link" title="View source">↗</a>` : '';
              return `<div class="metric-card"><div class="label">${l}${srcLink}</div><div class="value">${escHtml(v)}</div></div>`;
            }).join('')}
          </div>
        </div>
      `;
    }

    let notableHtml = '';
    if (metrics.notable) {
      const notableSrc = metrics.notable_source ? `<a href="${escAttr(metrics.notable_source)}" target="_blank" rel="noopener" class="evidence-link" title="View source">↗</a>` : '';
      notableHtml = `
        <div class="modal-section">
          <h3>Notable ${notableSrc}</h3>
          <p style="font-size:0.85rem;color:var(--text-dim);">${escHtml(metrics.notable)}</p>
        </div>
      `;
    }

    let techStackHtml = '';
    if (metrics.tech_stack) {
      const techs = metrics.tech_stack.split(',').map((t) => t.trim()).filter(Boolean);
      if (techs.length) {
        const tsSource = metricStr(metrics.tech_stack_source);
        techStackHtml = `
          <div class="modal-section">
            <h3>Tech Stack${tsSource ? ` <a href="${escAttr(tsSource)}" target="_blank" rel="noopener" class="metric-source-link">source</a>` : ''}</h3>
            <div class="tech-stack-tags">
              ${techs.map((t) => `<span class="tech-stack-tag">${escHtml(t)}</span>`).join('')}
            </div>
          </div>
        `;
      }
    }

    let discoveriesHtml = '';
    if (discoveries.length) {
      discoveriesHtml = `
        <div class="modal-section">
          <h3>Source Mentions (${discoveries.length})</h3>
          <ul class="discovery-list">
            ${discoveries.map((d) => `
              <li>
                <a href="${escAttr(d.candidate_url)}" target="_blank" rel="noopener">${escHtml(d.title || d.candidate_url)}</a>
                <div class="discovery-meta">
                  ${d.meta?.subreddit ? `<span class="disc-tag">r/${escHtml(d.meta.subreddit)}</span>` : ''}
                  ${d.meta?.feed_label ? `<span class="disc-tag">${escHtml(d.meta.feed_label)}</span>` : ''}
                  ${d.meta?.upvotes ? `<span class="disc-tag">▲ ${d.meta.upvotes}</span>` : ''}
                  <span class="disc-tag">${fmt(d.discovered_at)}</span>
                  <span class="disc-tag status-${d.status}">${d.status}</span>
                </div>
                ${d.meta?.snippet ? `<p class="evidence-snippet">${escHtml(d.meta.snippet.slice(0, 200))}</p>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    const evidenceMap = {};
    for (const ev of evidence) {
      evidenceMap[String(ev._id)] = ev;
    }

    let signalsHtml = '';
    if (signals.length) {
      signalsHtml = `
        <div class="modal-section">
          <h3>Signals (${signals.length})</h3>
          <ul class="signal-list">
            ${signals.slice(0, 25).map((s) => {
              const ev = s.evidence_id ? evidenceMap[String(s.evidence_id)] : null;
              const srcLink = ev?.url ? ` <a href="${escAttr(ev.url)}" target="_blank" rel="noopener" class="evidence-link" title="View source">↗</a>` : '';
              return `<li><span class="signal-type">${escHtml(s.signal_type)}${s.enriched ? ' ✦' : ''}${srcLink}</span><span class="signal-value">${escHtml(s.value_text || '')}</span></li>`;
            }).join('')}
          </ul>
        </div>
      `;
    }

    let evidenceHtml = '';
    if (evidence.length) {
      evidenceHtml = `
        <div class="modal-section">
          <h3>Evidence (${evidence.length})</h3>
          <ul class="evidence-list">
            ${evidence.slice(0, 15).map((ev) => `
              <li>
                <a href="${escAttr(ev.url)}" target="_blank" rel="noopener">${escHtml(ev.url)}</a>
                ${ev.type ? `<span class="disc-tag">${escHtml(ev.type)}</span>` : ''}
                ${ev.snippet ? `<p class="evidence-snippet">${escHtml(ev.snippet)}</p>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    const recentNews = e.enrichment?.recent_news || [];
    let newsHtml = '';
    if (recentNews.length) {
      newsHtml = `
        <div class="modal-section">
          <h3>Recent News (${recentNews.length})</h3>
          <ul class="news-list">
            ${recentNews.map((n) => `
              <li>
                <a href="${escAttr(n.url)}" target="_blank" rel="noopener">${escHtml(n.title)}</a>
                ${n.date ? `<span class="news-date">${escHtml(n.date)}</span>` : ''}
                ${n.summary ? `<p class="news-summary">${escHtml(n.summary)}</p>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    const enrichedAt = e.enrichment?.enriched_at;
    const verified = e.enrichment?.web_verified;

    body.innerHTML = `
      <h2>${escHtml(name)}</h2>
      <div class="modal-tags">
        ${category ? `<span class="modal-category">${escHtml(category)}</span>` : ''}
        ${conf != null ? `<span class="modal-conf">${Math.round(conf * 100)}% confidence</span>` : ''}
        ${verified ? '<span class="modal-verified">Web Verified</span>' : ''}
        ${enrichedAt ? `<span class="modal-enriched-badge">Enriched ${fmt(enrichedAt)}</span>` : '<span class="modal-raw-badge">Not yet enriched</span>'}
      </div>
      ${desc ? `<p class="modal-desc">${escHtml(desc)}</p>` : ''}
      ${url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener" class="modal-url">${escHtml(url)}</a>` : ''}
      ${metricsHtml}
      ${notableHtml}
      ${techStackHtml}
      ${newsHtml}
      ${discoveriesHtml}
      ${signalsHtml}
      ${evidenceHtml}
      <p class="muted" style="margin-top:1rem;font-size:0.72rem;">
        Created ${fmtFull(e.created_at)} · Updated ${fmtFull(e.updated_at)}
        ${e.canonical_domain ? ` · Domain: ${escHtml(e.canonical_domain)}` : ''}
      </p>
    `;
  } catch (err) {
    body.innerHTML = `<p class="muted">Error: ${escHtml(err.message)}</p>`;
  }
}

$('#modal-close').addEventListener('click', () => { $('#modal-overlay').hidden = true; });
$('#modal-overlay').addEventListener('click', (ev) => {
  if (ev.target === $('#modal-overlay')) $('#modal-overlay').hidden = true;
});

/* Report modal */
function openReportModal(url) {
  _reportDD.hidden = true;
  const overlay = $('#report-modal-overlay');
  const iframe = $('#report-modal-iframe');
  iframe.src = url;
  overlay.hidden = false;
}

function closeReportModal() {
  const overlay = $('#report-modal-overlay');
  const iframe = $('#report-modal-iframe');
  overlay.hidden = true;
  iframe.src = 'about:blank';
}

$('#report-modal-close').addEventListener('click', closeReportModal);
$('#report-modal-overlay').addEventListener('click', (ev) => {
  if (ev.target === $('#report-modal-overlay')) closeReportModal();
});

$('#search-input').addEventListener('input', (ev) => {
  searchQuery = ev.target.value.trim();
  currentPage = 1;
  renderEntities();
});

$('#filter-category').addEventListener('change', (ev) => {
  currentCategory = ev.target.value;
  currentPage = 1;
  renderEntities();
});

$('#sort-select').addEventListener('change', (ev) => {
  currentSort = ev.target.value;
  currentPage = 1;
  if (currentSort === 'revenue_first') {
    renderEntities();
  } else {
    loadEntities();
  }
});

/* Pipeline: Scan → Enrich → Report */
let pipelineTimer = null;
let pipelineScanDone = false;
let pipelineEnrichDone = false;
let pipelineReportDone = false;
let pipelineEmptyJobPolls = 0;

function showPipeline() {
  $('#pipeline-progress').hidden = false;
}

function hidePipeline() {
  $('#pipeline-progress').hidden = true;
}

function setStepState(stepId, state, detail) {
  const el = $(`#step-${stepId}`);
  el.className = 'pipeline-step' + (state ? ` ${state}` : '');
  $(`#step-${stepId}-detail`).textContent = detail || '';
}

function resetPipeline() {
  pipelineScanDone = false;
  pipelineEnrichDone = false;
  pipelineReportDone = false;
  pipelineEmptyJobPolls = 0;
  setStepState('scan', 'active', 'starting…');
  setStepState('enrich', '', 'waiting');
  setStepState('report', '', 'waiting');
}

async function pollPipeline() {
  try {
    const [scanData, jobs] = await Promise.all([
      api('GET', '/admin/scan/status'),
      api('GET', '/admin/jobs'),
    ]);

    if (!pipelineScanDone) {
      const c = scanData.counts || {};
      const sj = jobs.scan;
      const scanDone = sj?.status === 'done' || sj?.status === 'error';
      const detail = c.new_candidates
        ? `${c.candidates || 0} sources crawled · ${c.new_candidates} unseen · ${c.success || 0} extracted`
        : `${c.candidates || 0} sources crawled · ${c.success || 0} extracted`;

      if (scanDone) {
        setStepState('scan', 'done', detail);
        pipelineScanDone = true;
        loadEntities();
      } else if (sj?.status === 'running' || scanData.is_running) {
        setStepState('scan', 'active', detail);
      }
    }

    if (pipelineScanDone && !pipelineEnrichDone) {
      const ej = jobs.enrich;
      if (ej?.status === 'running') {
        pipelineEmptyJobPolls = 0;
        setStepState('enrich', 'active', `${ej.completed || 0}/${ej.total || '?'} done`);
      } else if (ej?.status === 'done') {
        const msg = typeof ej.message === 'string' ? ej.message : ej.message?.message || 'complete';
        setStepState('enrich', 'done', msg);
        pipelineEnrichDone = true;
        loadEntities();
      } else if (ej?.status === 'error') {
        setStepState('enrich', 'error', 'failed');
        pipelineEnrichDone = true;
      } else if (!ej) {
        pipelineEmptyJobPolls++;
        if (pipelineEmptyJobPolls > 6) {
          setStepState('enrich', 'done', 'complete');
          pipelineEnrichDone = true;
        } else {
          setStepState('enrich', 'active', 'starting…');
        }
      }
    }

    if (pipelineScanDone && pipelineEnrichDone && !pipelineReportDone) {
      const rj = jobs.report;
      if (rj?.status === 'running') {
        pipelineEmptyJobPolls = 0;
        setStepState('report', 'active', rj.message || 'generating…');
      } else if (rj?.status === 'done') {
        const msg = typeof rj.message === 'string' ? rj.message : rj.message?.message || 'complete';
        setStepState('report', 'done', msg);
        pipelineReportDone = true;
        loadHistory();
        loadEntities();
      } else if (rj?.status === 'error') {
        setStepState('report', 'error', 'failed');
        pipelineReportDone = true;
      } else if (!rj) {
        pipelineEmptyJobPolls++;
        if (pipelineEmptyJobPolls > 6) {
          setStepState('report', 'done', 'complete');
          pipelineReportDone = true;
          loadHistory();
          loadEntities();
        } else {
          setStepState('report', 'active', 'starting…');
        }
      }
    }

    if (pipelineScanDone && pipelineEnrichDone && pipelineReportDone) {
      const rMsg = jobs.report?.message;
      const noReport = typeof rMsg === 'string' && rMsg.toLowerCase().includes('no new');
      const summary = noReport
        ? 'Pipeline complete — no new startups found this scan'
        : 'Pipeline complete — scan, enrich & report done';
      setFeedback(enrichTimer ? 'Pipeline complete — re-enrichment still running' : summary, enrichTimer ? 'loading' : (noReport ? 'info' : 'success'));
      $('#btn-scan').disabled = false;
      stopPipelinePolling();
      setTimeout(() => { hidePipeline(); if (!enrichTimer) setFeedback('', ''); }, 12000);
    }
  } catch {
    stopPipelinePolling();
  }
}

function startPipelinePolling() {
  if (pipelineTimer) return;
  pipelineTimer = setInterval(pollPipeline, 3000);
  setTimeout(pollPipeline, 800);
}

function stopPipelinePolling() {
  if (pipelineTimer) { clearInterval(pipelineTimer); pipelineTimer = null; }
}

/* Enrich-only UI */
let enrichTimer = null;

function showEnrichProgress() {
  $('#enrich-progress').hidden = false;
}

function hideEnrichProgress() {
  $('#enrich-progress').hidden = true;
}

function updateEnrichBar(completed, failed, total) {
  const pct = total ? Math.round(((completed + failed) / total) * 100) : 0;
  $('#enrich-detail').textContent = `${completed} done · ${failed} failed / ${total} total (${pct}%)`;
  $('#enrich-fill').style.width = `${pct}%`;
}

async function pollEnrichOnly() {
  try {
    const jobs = await api('GET', '/admin/jobs');
    const ej = jobs['re-enrich'];
    if (ej?.status === 'running') {
      updateEnrichBar(ej.completed || 0, ej.failed || 0, ej.total || 0);
    } else if (ej?.status === 'done') {
      const msg = typeof ej.message === 'string' ? ej.message : 'complete';
      $('#enrich-detail').textContent = msg;
      $('#enrich-fill').style.width = '100%';
      if (!pipelineTimer) setFeedback('Re-enrichment complete', 'success');
      $('#btn-enrich').disabled = false;
      stopEnrichPolling();
      loadEntities();
      setTimeout(() => { hideEnrichProgress(); if (!pipelineTimer) setFeedback('', ''); }, 8000);
    } else if (ej?.status === 'error') {
      $('#enrich-detail').textContent = 'failed';
      if (!pipelineTimer) setFeedback('Re-enrichment failed', 'error');
      $('#btn-enrich').disabled = false;
      stopEnrichPolling();
      setTimeout(() => { hideEnrichProgress(); if (!pipelineTimer) setFeedback('', ''); }, 5000);
    }
  } catch {
    stopEnrichPolling();
  }
}

function startEnrichPolling() {
  if (enrichTimer) return;
  enrichTimer = setInterval(pollEnrichOnly, 3000);
  setTimeout(pollEnrichOnly, 800);
}

function stopEnrichPolling() {
  if (enrichTimer) { clearInterval(enrichTimer); enrichTimer = null; }
}

$('#btn-enrich').addEventListener('click', async () => {
  if (!confirm('Re-enrich all startup entities? This will update metrics, evidence links, and news for every entity.')) return;
  $('#btn-enrich').disabled = true;
  setFeedback('Re-enrichment underway…', 'loading');
  showEnrichProgress();
  updateEnrichBar(0, 0, 0);
  try {
    const res = await api('POST', '/admin/re-enrich');
    if (res.count > 0) {
      setFeedback(`Re-enrichment underway — ${res.count} entities…`, 'loading');
      startEnrichPolling();
    } else {
      setFeedback('No entities to enrich', 'info');
      $('#btn-enrich').disabled = false;
      hideEnrichProgress();
      setTimeout(() => setFeedback('', ''), 3000);
    }
  } catch (err) {
    setFeedback(`Enrich error: ${err.message}`, 'error');
    $('#btn-enrich').disabled = false;
    hideEnrichProgress();
    setTimeout(() => setFeedback('', ''), 5000);
  }
});

$('#btn-scan').addEventListener('click', async () => {
  $('#btn-scan').disabled = true;
  setFeedback('Scan underway…', 'loading');
  resetPipeline();
  showPipeline();
  try {
    await api('POST', '/admin/scan/run');
    startPipelinePolling();
  } catch (err) {
    setFeedback(`Scan error: ${err.message}`, 'error');
    $('#btn-scan').disabled = false;
    hidePipeline();
    setTimeout(() => setFeedback('', ''), 5000);
  }
});

async function loadHistory() {
  const list = $('#history-list');
  try {
    const reports = await api('GET', '/reports');
    if (!reports.length) {
      list.innerHTML = '<p class="muted">No reports generated yet.</p>';
      return;
    }
    list.innerHTML = reports.map((r, i) => `
      <div class="history-item${i === 0 ? ' latest' : ''}">
        <div class="hi-info">
          <span class="hi-date">${i === 0 ? 'Latest — ' : ''}${fmtFull(r.generated_at)}</span>
          <span class="hi-stats">${r.stats?.entities_in_report || '?'} startups · ${r.stats?.total_entities_updated || '?'} scanned</span>
        </div>
        <button class="hi-link" onclick="openReportModal('/report/${r._id}')">View</button>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<p class="muted">Failed to load history.</p>';
  }
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function escAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Reports dropdown — move to body so it escapes nav stacking context */
const _reportDD = $('#report-history-dropdown');
document.body.appendChild(_reportDD);

$('#btn-reports-toggle').addEventListener('click', (ev) => {
  ev.stopPropagation();
  const opening = _reportDD.hidden;
  _reportDD.hidden = !_reportDD.hidden;
  if (opening) {
    loadHistory();
    const rect = ev.currentTarget.getBoundingClientRect();
    _reportDD.style.position = 'fixed';
    _reportDD.style.top = `${rect.bottom + 6}px`;
    if (window.innerWidth <= 768) {
      _reportDD.style.left = '1rem';
      _reportDD.style.right = '1rem';
      _reportDD.style.width = 'calc(100vw - 2rem)';
    } else {
      _reportDD.style.left = '';
      _reportDD.style.right = `${window.innerWidth - rect.right}px`;
      _reportDD.style.width = '340px';
    }
  }
});

document.addEventListener('click', (ev) => {
  if (!_reportDD.hidden && !ev.target.closest('.report-dropdown-wrap') && !ev.target.closest('#report-history-dropdown')) {
    _reportDD.hidden = true;
  }
});

document.querySelectorAll('.help-btn').forEach((btn) => {
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    const wrap = btn.closest('.nav-btn-wrap');
    if (!wrap) return;
    const tip = wrap.querySelector('.btn-tooltip');
    if (!tip) return;
    const wasOpen = tip.classList.contains('show');
    document.querySelectorAll('.btn-tooltip.show').forEach((t) => t.classList.remove('show'));
    if (!wasOpen) tip.classList.add('show');
  });
});

document.addEventListener('click', () => {
  document.querySelectorAll('.btn-tooltip.show').forEach((t) => t.classList.remove('show'));
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (!$('#report-modal-overlay').hidden) closeReportModal();
    else if (!$('#modal-overlay').hidden) $('#modal-overlay').hidden = true;
  }
});

async function checkRunningPipeline() {
  try {
    const [scanData, jobs] = await Promise.all([
      api('GET', '/admin/scan/status'),
      api('GET', '/admin/jobs'),
    ]);

    const scanJobActive = jobs.scan?.status === 'running';
    const scanRunsActive = scanData.is_running;
    const scanRunning = scanJobActive || scanRunsActive;
    const enrichRunning = jobs.enrich?.status === 'running';
    const reportRunning = jobs.report?.status === 'running';
    const reEnrichRunning = jobs['re-enrich']?.status === 'running';

    if (reEnrichRunning) {
      $('#btn-enrich').disabled = true;
      showEnrichProgress();
      const ej = jobs['re-enrich'];
      updateEnrichBar(ej.completed || 0, ej.failed || 0, ej.total || 0);
      startEnrichPolling();
    }

    if (!scanRunning && !enrichRunning && !reportRunning) return;

    $('#btn-scan').disabled = true;
    showPipeline();

    if (scanRunning && !enrichRunning && !reportRunning) {
      pipelineScanDone = false;
      pipelineEnrichDone = false;
      pipelineReportDone = false;
      const c = scanData.counts || {};
      const detail = c.new_candidates
        ? `${c.candidates || 0} sources crawled · ${c.new_candidates} unseen · ${c.success || 0} extracted`
        : `${c.candidates || 0} sources crawled · ${c.success || 0} extracted`;
      setStepState('scan', 'active', detail);
      setStepState('enrich', '', 'waiting');
      setStepState('report', '', 'waiting');
    } else if (enrichRunning) {
      pipelineScanDone = true;
      pipelineEnrichDone = false;
      pipelineReportDone = false;
      setStepState('scan', 'done', 'complete');
      const ej = jobs.enrich;
      setStepState('enrich', 'active', `${ej.completed || 0}/${ej.total || '?'} done`);
      setStepState('report', '', 'waiting');
    } else if (reportRunning) {
      pipelineScanDone = true;
      pipelineEnrichDone = true;
      pipelineReportDone = false;
      setStepState('scan', 'done', 'complete');
      setStepState('enrich', 'done', 'complete');
      setStepState('report', 'active', jobs.report.message || 'generating…');
    }

    setFeedback('Pipeline underway…', 'loading');
    startPipelinePolling();
  } catch {
    // ignore — no running pipeline
  }
}

// ── Cluster Visualization (real embedding projection) ──
(function initClusterViz() {
  const canvas = document.getElementById('cluster-canvas');
  const tooltip = document.getElementById('cluster-tooltip');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const CATEGORY_COLORS = {
    'AI SaaS': '#6366f1', 'AI Agent': '#a855f7', 'AI Developer Tools': '#3b82f6',
    'AI Healthcare': '#22c55e', 'AI Finance': '#eab308', 'AI Research': '#06b6d4',
    'AI Infrastructure': '#f97316', 'AI EdTech': '#ec4899', 'AI Marketing': '#14b8a6',
    'AI Media': '#f43f5e', 'LLM Tool': '#8b5cf6', 'AI Video': '#ef4444',
    'AI Design': '#d946ef', 'AI Security': '#0ea5e9', 'AI E-commerce': '#84cc16',
  };
  const DEFAULT_COLOR = '#6366f1';

  let nodes = [];
  let clusterCenters = [];
  let rawData = null;
  let W = 0, H = 0;
  let hoveredNode = null;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildNodes(data) {
    nodes = [];
    clusterCenters = [];
    const cats = {};
    const mobile = W < 500;
    const s = mobile ? 0.55 : 1;
    const pad = mobile ? 10 : 30;

    for (const d of data) {
      const cat = d.category || 'Other';
      const color = CATEGORY_COLORS[cat] || DEFAULT_COLOR;
      const hasRevenue = !!d.revenue;
      const hasFunding = !!d.funding;
      const size = (hasRevenue ? 5.5 : hasFunding ? 4 : 2.5) * s;
      const px = pad + d.x * (W - pad * 2);
      const py = pad + d.y * (H - pad * 2);

      if (!cats[cat]) cats[cat] = { sx: 0, sy: 0, n: 0, color };
      cats[cat].sx += px;
      cats[cat].sy += py;
      cats[cat].n++;

      nodes.push({
        baseX: px, baseY: py,
        x: px, y: py,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        size, color,
        alpha: hasRevenue ? 0.95 : hasFunding ? 0.7 : 0.35,
        name: d.name,
        category: cat,
        metric: d.revenue || d.funding || d.traffic || null,
        techStack: d.tech_stack || null,
        _id: d._id,
        glow: hasRevenue,
      });
    }

    for (const [cat, info] of Object.entries(cats)) {
      if (info.n < 3) continue;
      clusterCenters.push({
        cat, color: info.color,
        cx: info.sx / info.n,
        cy: info.sy / info.n,
        count: info.n,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    for (const c of clusterCenters) {
      const r = Math.max(40, Math.sqrt(c.count) * 18);
      const grad = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, r);
      grad.addColorStop(0, c.color + '10');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.cx, c.cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const connectionDist = 40;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < connectionDist && nodes[i].color === nodes[j].color) {
          ctx.strokeStyle = nodes[i].color;
          ctx.globalAlpha = (1 - d / connectionDist) * 0.18;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    for (const n of nodes) {
      const isHovered = n === hoveredNode;
      if (n.glow) {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size + 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = isHovered ? 1 : n.alpha;
      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, isHovered ? n.size + 2.5 : n.size, 0, Math.PI * 2);
      ctx.fill();
      if (isHovered) {
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size + 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.textAlign = 'center';
    for (const c of clusterCenters) {
      if (c.count < 5) continue;
      const label = c.cat.replace('AI ', '');
      ctx.globalAlpha = 0.9;
      ctx.font = '700 13px Inter, system-ui, sans-serif';
      ctx.fillStyle = c.color;
      ctx.fillText(label, c.cx, c.cy - 24);
      ctx.globalAlpha = 0.5;
      ctx.font = '600 9.5px Inter, system-ui, sans-serif';
      ctx.fillText(c.count + ' startups', c.cx, c.cy - 10);
    }

    ctx.globalAlpha = 1;
  }

  function update() {
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      const dx = n.baseX - n.x;
      const dy = n.baseY - n.y;
      n.vx += dx * 0.001;
      n.vy += dy * 0.001;
      n.vx += (Math.random() - 0.5) * 0.008;
      n.vy += (Math.random() - 0.5) * 0.008;
      n.vx *= 0.99;
      n.vy *= 0.99;
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let closest = null;
    let closestDist = 18;
    for (const n of nodes) {
      const d = Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2);
      if (d < closestDist) { closest = n; closestDist = d; }
    }
    hoveredNode = closest;
    if (closest) {
      canvas.style.cursor = 'pointer';
      let html = `<span class="tt-name">${closest.name}</span><span class="tt-cat">${closest.category}</span>`;
      if (closest.metric) html += `<span class="tt-metric">${closest.metric}</span>`;
      tooltip.innerHTML = html;
      tooltip.classList.add('visible');
      tooltip.style.left = Math.min(closest.x + 14, W - 200) + 'px';
      tooltip.style.top = (closest.y - 44) + 'px';
    } else {
      canvas.style.cursor = 'default';
      tooltip.classList.remove('visible');
    }
  });

  canvas.addEventListener('mouseleave', () => {
    hoveredNode = null;
    tooltip.classList.remove('visible');
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('click', () => {
    if (hoveredNode?._id) openEntityModal(hoveredNode._id);
  });

  let touchedNode = null;
  canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const mx = touch.clientX - rect.left;
    const my = touch.clientY - rect.top;
    let closest = null;
    let closestDist = 24;
    for (const n of nodes) {
      const d = Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2);
      if (d < closestDist) { closest = n; closestDist = d; }
    }
    if (closest) {
      e.preventDefault();
      if (touchedNode === closest) {
        openEntityModal(closest._id);
        touchedNode = null;
        hoveredNode = null;
        tooltip.classList.remove('visible');
        return;
      }
      touchedNode = closest;
      hoveredNode = closest;
      let html = `<span class="tt-name">${closest.name}</span><span class="tt-cat">${closest.category}</span>`;
      if (closest.metric) html += `<span class="tt-metric">${closest.metric}</span>`;
      tooltip.innerHTML = html;
      tooltip.classList.add('visible');
      tooltip.style.left = Math.min(closest.x + 14, W - 200) + 'px';
      tooltip.style.top = (closest.y - 44) + 'px';
    } else {
      touchedNode = null;
      hoveredNode = null;
      tooltip.classList.remove('visible');
    }
  }, { passive: false });

  async function load() {
    resize();
    try {
      const res = await api('GET', '/entities/cluster-map');
      if (res.nodes?.length) {
        rawData = res.nodes;
        buildNodes(rawData);
        loop();
      }
    } catch (err) {
      console.warn('[ClusterViz] Failed to load:', err.message);
    }
  }

  window.addEventListener('resize', () => {
    resize();
    if (rawData) buildNodes(rawData);
  });

  load();
})();

// ── Chat ──
const chatHistory = [];
let chatStreaming = false;

const EXAMPLE_QUESTIONS = [
  'Which startups raised the most funding?',
  'Compare AI video generation companies',
  'What startups use React in their stack?',
  'Which YC companies are in the database?',
  'Show me startups with the most traffic',
  'What are the fastest growing startups?',
  'Which companies have the most employees?',
  'Find startups in the NLP space',
  'Who are the solo founder startups?',
  'What startups were founded in 2024?',
  'Which startups have revenue data?',
  'Compare the top-funded AI startups',
];

let exampleIdx = 0;
let exampleTimer = null;

function showExamples() {
  const container = $('#chat-examples');
  container.innerHTML = '';
  const batch = [];
  const count = window.innerWidth < 500 ? 2 : 3;
  for (let i = 0; i < count; i++) {
    batch.push(EXAMPLE_QUESTIONS[(exampleIdx + i) % EXAMPLE_QUESTIONS.length]);
  }
  exampleIdx = (exampleIdx + count) % EXAMPLE_QUESTIONS.length;
  batch.forEach((q) => {
    const chip = document.createElement('button');
    chip.className = 'chat-example-chip fade-in';
    chip.textContent = q;
    chip.addEventListener('click', () => sendChat(q));
    container.appendChild(chip);
  });
}

function startExampleRotation() {
  showExamples();
  exampleTimer = setInterval(showExamples, 6000);
}

function stopExampleRotation() {
  if (exampleTimer) { clearInterval(exampleTimer); exampleTimer = null; }
}

function openChatModal() {
  $('#chat-overlay').hidden = false;
  stopExampleRotation();
  setTimeout(() => $('#chat-modal-input').focus(), 50);
}

$('#chat-close').addEventListener('click', () => {
  $('#chat-overlay').hidden = true;
  if (chatHistory.length === 0) startExampleRotation();
});

$('#chat-overlay').addEventListener('click', (e) => {
  if (e.target === $('#chat-overlay')) {
    $('#chat-overlay').hidden = true;
    if (chatHistory.length === 0) startExampleRotation();
  }
});

function escChat(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const markedInstance = new marked.Marked({
  breaks: true,
  gfm: true,
});

function renderMarkdown(text) {
  return markedInstance.parse(text);
}

function appendChatMsg(role, content) {
  const el = document.createElement('div');
  el.className = `chat-msg ${role}`;
  el.innerHTML = `<div class="chat-msg-content">${content}</div>`;
  $('#chat-messages').appendChild(el);
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
  return el.querySelector('.chat-msg-content');
}

async function sendChat(msg) {
  if (!msg || chatStreaming) return;

  if ($('#chat-overlay').hidden) openChatModal();

  appendChatMsg('user', escChat(msg));
  chatHistory.push({ role: 'user', content: msg });

  $('#chat-input').value = '';
  $('#chat-modal-input').value = '';

  chatStreaming = true;
  $('#chat-send').disabled = true;
  const contentEl = appendChatMsg('assistant', '<span class="chat-typing">Thinking…</span>');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: chatHistory.slice(-10) }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let sseBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') break;
        try {
          const { token, error } = JSON.parse(payload);
          if (error) throw new Error(error);
          if (token) {
            fullText += token;
            contentEl.innerHTML = renderMarkdown(fullText);
            $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
          }
        } catch {}
      }
    }

    if (fullText) {
      chatHistory.push({ role: 'assistant', content: fullText });
    } else {
      contentEl.innerHTML = '<em>No response received.</em>';
    }
  } catch (err) {
    contentEl.innerHTML = `<span class="chat-error">Error: ${escChat(err.message)}</span>`;
  } finally {
    chatStreaming = false;
    $('#chat-send').disabled = false;
    if (!$('#chat-overlay').hidden) $('#chat-modal-input').focus();
  }
}

$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendChat($('#chat-input').value.trim());
  }
});

$('#chat-send').addEventListener('click', () => {
  sendChat($('#chat-input').value.trim());
});

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  sendChat($('#chat-modal-input').value.trim());
});

startExampleRotation();

$('#btn-nav-chat').addEventListener('click', () => {
  const chatBar = document.getElementById('chat-bar');
  if (chatBar && chatBar.style.display !== 'none') {
    $('#chat-input').focus();
    chatBar.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    openChatModal();
  }
});

$('#nav-brand-link').addEventListener('click', (e) => {
  e.preventDefault();
  currentPage = 1;
  searchQuery = '';
  $('#search-input').value = '';
  renderEntities();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

checkHealth();
loadEntities();
loadHistory();
checkRunningPipeline();
setInterval(checkHealth, 30000);
