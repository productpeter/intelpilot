const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const PAGE_SIZE = 24;
let currentPage = 1;
let totalEntities = 0;
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

async function api(method, path) {
  const res = await fetch(`/api${path}`, { method });
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
    const res = await api('GET', `/entities?sort=${currentSort}&order=desc&limit=10000&skip=0`);
    allEntities = res.data || [];
    totalEntities = res.total || allEntities.length;

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

function hasRevenue(e) {
  return !!(e.enrichment?.metrics?.revenue);
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

  const rev = metricStr(metrics.revenue);
  const fund = metricStr(metrics.funding);
  const users = metricStr(metrics.user_count);
  const team = metricStr(metrics.team_size);

  let metricBadges = '';
  if (rev) metricBadges += `<span class="metric-badge revenue">$ ${escHtml(rev)}</span>`;
  if (fund) metricBadges += `<span class="metric-badge funding">↑ ${escHtml(fund)}</span>`;
  if (users) metricBadges += `<span class="metric-badge users">👤 ${escHtml(users)}</span>`;
  if (team) metricBadges += `<span class="metric-badge team">⚙ ${escHtml(team)}</span>`;

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
    const metricFields = [
      ['Revenue', metricStr(metrics.revenue)],
      ['Funding', metricStr(metrics.funding)],
      ['Users', metricStr(metrics.user_count)],
      ['Team Size', metricStr(metrics.team_size)],
      ['Growth', metricStr(metrics.growth)],
      ['Founded', metricStr(metrics.founded_year)],
    ];
    const filled = metricFields.filter(([, v]) => v);
    if (filled.length) {
      metricsHtml = `
        <div class="modal-section">
          <h3>Metrics</h3>
          <div class="metrics-grid">
            ${filled.map(([l, v]) => `<div class="metric-card"><div class="label">${l}</div><div class="value">${escHtml(v)}</div></div>`).join('')}
          </div>
        </div>
      `;
    }

    let notableHtml = '';
    if (metrics.notable) {
      notableHtml = `
        <div class="modal-section">
          <h3>Notable</h3>
          <p style="font-size:0.85rem;color:var(--text-dim);">${escHtml(metrics.notable)}</p>
        </div>
      `;
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

    let signalsHtml = '';
    if (signals.length) {
      signalsHtml = `
        <div class="modal-section">
          <h3>Signals (${signals.length})</h3>
          <ul class="signal-list">
            ${signals.slice(0, 25).map((s) => `<li><span class="signal-type">${escHtml(s.signal_type)}${s.enriched ? ' ✦' : ''}</span><span class="signal-value">${escHtml(s.value_text || '')}</span></li>`).join('')}
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
  const overlay = $('#report-modal-overlay');
  const iframe = $('#report-modal-iframe');
  const newtab = $('#report-modal-newtab');
  iframe.src = url;
  newtab.href = url;
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
      if (scanData.is_running) {
        setStepState('scan', 'active', `${c.success || 0} extracted · ${c.candidates || 0} candidates`);
      } else {
        setStepState('scan', 'done', `${c.success || 0} extracted`);
        pipelineScanDone = true;
        loadEntities();
      }
    }

    if (pipelineScanDone && !pipelineEnrichDone) {
      const ej = jobs.enrich;
      if (ej?.status === 'running') {
        setStepState('enrich', 'active', `${ej.completed || 0}/${ej.total || '?'} done`);
      } else if (ej?.status === 'done') {
        setStepState('enrich', 'done', ej.message || 'complete');
        pipelineEnrichDone = true;
        loadEntities();
      } else if (ej?.status === 'error') {
        setStepState('enrich', 'error', 'failed');
        pipelineEnrichDone = true;
      } else if (!ej) {
        setStepState('enrich', 'active', 'starting…');
      }
    }

    if (pipelineScanDone && pipelineEnrichDone && !pipelineReportDone) {
      const rj = jobs.report;
      if (rj?.status === 'running') {
        setStepState('report', 'active', rj.message || 'generating…');
      } else if (rj?.status === 'done') {
        setStepState('report', 'done', rj.message || 'complete');
        pipelineReportDone = true;
        loadHistory();
        loadEntities();
      } else if (rj?.status === 'error') {
        setStepState('report', 'error', 'failed');
        pipelineReportDone = true;
      } else if (!rj) {
        setStepState('report', 'active', 'starting…');
      }
    }

    if (pipelineScanDone && pipelineEnrichDone && pipelineReportDone) {
      setFeedback('Pipeline complete — scan, enrich & report done', 'success');
      $('#btn-scan').disabled = false;
      stopPipelinePolling();
      setTimeout(() => { hidePipeline(); setFeedback('', ''); }, 8000);
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

$('#btn-scan').addEventListener('click', async () => {
  $('#btn-scan').disabled = true;
  setFeedback('Starting scan pipeline…', 'loading');
  resetPipeline();
  showPipeline();
  try {
    await api('POST', '/admin/scan/run');
    startPipelinePolling();
  } catch (err) {
    setFeedback(`Scan error: ${err.message}`, 'error');
    $('#btn-scan').disabled = false;
    hidePipeline();
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
    list.innerHTML = reports.map((r) => `
      <div class="history-item">
        <div class="hi-info">
          <span class="hi-date">${fmtFull(r.generated_at)}</span>
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

/* Report history dropdown */
$('#btn-history-toggle').addEventListener('click', (ev) => {
  ev.stopPropagation();
  const dd = $('#report-history-dropdown');
  dd.hidden = !dd.hidden;
});

document.addEventListener('click', (ev) => {
  const dd = $('#report-history-dropdown');
  if (!dd.hidden && !ev.target.closest('.report-dropdown-wrap')) {
    dd.hidden = true;
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

    const scanRunning = scanData.is_running;
    const enrichRunning = jobs.enrich?.status === 'running';
    const reportRunning = jobs.report?.status === 'running';

    if (!scanRunning && !enrichRunning && !reportRunning) return;

    $('#btn-scan').disabled = true;
    showPipeline();

    if (scanRunning) {
      pipelineScanDone = false;
      pipelineEnrichDone = false;
      pipelineReportDone = false;
      const c = scanData.counts || {};
      setStepState('scan', 'active', `${c.success || 0} extracted · ${c.candidates || 0} candidates`);
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

    setFeedback('Pipeline in progress…', 'loading');
    startPipelinePolling();
  } catch {
    // ignore — no running pipeline
  }
}

checkHealth();
loadEntities();
loadHistory();
checkRunningPipeline();
setInterval(checkHealth, 30000);
