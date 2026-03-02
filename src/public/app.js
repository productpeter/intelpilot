const $ = (sel) => document.querySelector(sel);

const btnScan = $('#btn-scan');
const btnReport = $('#btn-report');
const btnEnrich = $('#btn-enrich');

function fmt(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function setStatus(id, text, type) {
  const el = $(`#${id}`);
  el.textContent = text;
  el.className = 'action-status ' + (type || '');
}

async function api(method, path) {
  const res = await fetch(`/api${path}`, { method });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function checkHealth() {
  try {
    const data = await api('GET', '/health');
    const dot = $('.dot');
    const text = $('.status-text');
    dot.classList.add('online');
    dot.classList.remove('offline');
    text.textContent = `Online — ${data.db || 'connected'}`;
  } catch {
    const dot = $('.dot');
    const text = $('.status-text');
    dot.classList.add('offline');
    dot.classList.remove('online');
    text.textContent = 'Offline';
  }
}

async function loadLatest() {
  const card = $('#latest-card');
  try {
    const res = await fetch('/api/reports/latest', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      card.innerHTML = '<p class="muted">No reports generated yet. Click "Generate Report" to create one.</p>';
      return;
    }
    const data = await res.json();
    const stats = data.stats || {};
    card.innerHTML = `
      <div class="latest-meta">
        <div class="meta-item"><span class="meta-label">Generated</span><span class="meta-value">${fmt(data.generated_at)}</span></div>
        <div class="meta-item"><span class="meta-label">Startups</span><span class="meta-value">${stats.entities_in_report || '—'}</span></div>
        <div class="meta-item"><span class="meta-label">Total Scanned</span><span class="meta-value">${stats.total_entities_updated || '—'}</span></div>
        <div class="meta-item"><span class="meta-label">Scans</span><span class="meta-value">${(stats.scans_completed || 0) + (stats.scans_failed || 0)}</span></div>
      </div>
      <a href="/report" class="btn-view-report" target="_blank">View Full Report</a>
    `;
  } catch {
    card.innerHTML = '<p class="muted">Failed to load latest report.</p>';
  }
}

async function loadHistory() {
  const list = $('#history-list');
  try {
    const reports = await api('GET', '/reports');
    if (!reports.length) {
      list.innerHTML = '<div class="empty">No reports yet.</div>';
      return;
    }
    list.innerHTML = reports.map((r) => `
      <div class="history-item">
        <div class="hi-info">
          <span class="hi-date">${fmt(r.generated_at)}</span>
          <span class="hi-stats">${r.stats?.entities_in_report || '?'} startups · ${r.stats?.total_entities_updated || '?'} entities scanned</span>
        </div>
        <div class="hi-actions">
          <a href="/report/${r._id}" class="btn-sm" target="_blank">View Report</a>
        </div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<p class="muted">Failed to load report history.</p>';
  }
}

let scanPollTimer = null;

async function pollScanStatus() {
  try {
    const data = await api('GET', '/admin/scan/status');
    if (data.is_running) {
      const latest = data.latest;
      const c = latest?.counts || {};
      setStatus(
        'scan-status',
        `Scanning… ${c.extracted_success || 0} extracted, ${c.extracted_fail || 0} failed (${c.candidates_found || 0} candidates)`,
        'loading',
      );
      btnScan.disabled = true;
    } else {
      const latest = data.latest;
      if (latest) {
        const c = latest.counts || {};
        const dur = latest.finished_at
          ? Math.round((new Date(latest.finished_at) - new Date(latest.started_at)) / 1000)
          : 0;
        setStatus(
          'scan-status',
          `Last scan: ${c.extracted_success || 0} extracted, ${c.extracted_fail || 0} failed — ${dur}s`,
          'success',
        );
      }
      btnScan.disabled = false;
      clearInterval(scanPollTimer);
      scanPollTimer = null;
    }
  } catch {
    clearInterval(scanPollTimer);
    scanPollTimer = null;
  }
}

btnScan.addEventListener('click', async () => {
  btnScan.disabled = true;
  setStatus('scan-status', 'Starting scan...', 'loading');
  try {
    await api('POST', '/admin/scan/run');
    if (scanPollTimer) clearInterval(scanPollTimer);
    scanPollTimer = setInterval(pollScanStatus, 3000);
    setTimeout(pollScanStatus, 1000);
  } catch (err) {
    setStatus('scan-status', `Error: ${err.message}`, 'error');
    btnScan.disabled = false;
  }
});

let jobPollTimer = null;

function startJobPolling() {
  if (jobPollTimer) return;
  jobPollTimer = setInterval(pollJobs, 3000);
  setTimeout(pollJobs, 500);
}

function stopJobPolling() {
  if (jobPollTimer) { clearInterval(jobPollTimer); jobPollTimer = null; }
}

async function pollJobs() {
  try {
    const jobs = await api('GET', '/admin/jobs');

    if (jobs.report) {
      const j = jobs.report;
      if (j.status === 'running') {
        setStatus('report-status', j.message || 'Generating…', 'loading');
        btnReport.disabled = true;
      } else if (j.status === 'done') {
        setStatus('report-status', `Done — ${j.message}`, 'success');
        btnReport.disabled = false;
        loadLatest();
        loadHistory();
      } else if (j.status === 'error') {
        setStatus('report-status', `Error: ${j.message}`, 'error');
        btnReport.disabled = false;
      }
    }

    if (jobs.enrich) {
      const j = jobs.enrich;
      if (j.status === 'running') {
        setStatus('enrich-status', `Enriching… ${j.completed}/${j.total} done, ${j.failed} failed`, 'loading');
        btnEnrich.disabled = true;
      } else if (j.status === 'done') {
        setStatus('enrich-status', `Done — ${j.message}`, 'success');
        btnEnrich.disabled = false;
      } else if (j.status === 'error') {
        setStatus('enrich-status', `Error: ${j.message}`, 'error');
        btnEnrich.disabled = false;
      }
    }

    const anyRunning = Object.values(jobs).some((j) => j.status === 'running');
    if (!anyRunning) stopJobPolling();
  } catch {
    stopJobPolling();
  }
}

btnReport.addEventListener('click', async () => {
  btnReport.disabled = true;
  setStatus('report-status', 'Starting report generation...', 'loading');
  try {
    api('POST', '/admin/report/generate').then((data) => {
      setStatus('report-status', `Report generated — ${data.items_count} startups`, 'success');
      btnReport.disabled = false;
      loadLatest();
      loadHistory();
      stopJobPolling();
    }).catch((err) => {
      setStatus('report-status', `Error: ${err.message}`, 'error');
      btnReport.disabled = false;
    });
    startJobPolling();
  } catch (err) {
    setStatus('report-status', `Error: ${err.message}`, 'error');
    btnReport.disabled = false;
  }
});

btnEnrich.addEventListener('click', async () => {
  btnEnrich.disabled = true;
  setStatus('enrich-status', 'Starting enrichment...', 'loading');
  try {
    const data = await api('POST', '/admin/enrich');
    setStatus('enrich-status', data.message || 'Enrichment started', 'loading');
    startJobPolling();
  } catch (err) {
    setStatus('enrich-status', `Error: ${err.message}`, 'error');
    btnEnrich.disabled = false;
  }
});

checkHealth();
loadLatest();
loadHistory();
setInterval(checkHealth, 30000);
