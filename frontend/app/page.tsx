export default function Home() {
  return (
    <>
      <nav className="navbar">
        <div className="nav-inner">
          <a href="/" className="nav-brand" id="nav-brand-link">
            <span className="logo">◆</span>
            <span className="brand-name">IntelPilot</span>
          </a>
          <div className="nav-status" id="status">
            <span className="pulse"></span>
            <span className="status-text">Connecting…</span>
          </div>
          <button className="nav-btn ghost nav-chat-btn" id="btn-nav-chat">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Ask AI
          </button>
          <div className="nav-actions">
            <div className="nav-btn-wrap">
              <button id="btn-scan" className="nav-btn scan">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                Scan for New Startups
                <span
                  className="help-btn"
                  role="button"
                  aria-label="What does Scan do?"
                >
                  ?
                </span>
              </button>
              <div className="btn-tooltip">
                Crawl all sources for new AI startups, auto-enrich discovered
                entities, then generate a report.
              </div>
            </div>
            <div className="nav-btn-wrap">
              <button id="btn-enrich" className="nav-btn enrich">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                </svg>
                Re-enrich All
                <span
                  className="help-btn"
                  role="button"
                  aria-label="What does Re-enrich do?"
                >
                  ?
                </span>
              </button>
              <div className="btn-tooltip">
                Re-run enrichment on all startup entities to update metrics,
                evidence links, and news articles.
              </div>
            </div>
            <div className="report-dropdown-wrap">
              <button className="nav-btn ghost" id="btn-reports-toggle">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Startup Reports
              </button>
              <div
                className="report-history-dropdown"
                id="report-history-dropdown"
                hidden
              >
                <div className="rhd-list" id="history-list">
                  <p className="muted">Loading…</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="nav-feedback" id="nav-feedback"></div>
        <div className="pipeline-progress" id="pipeline-progress" hidden>
          <div className="pipeline-steps">
            <div className="pipeline-step" id="step-scan">
              <div className="step-row">
                <span className="step-icon">1</span>
                <span className="step-label">Scanning sources</span>
              </div>
              <span className="step-detail" id="step-scan-detail"></span>
            </div>
            <div className="pipeline-step" id="step-enrich">
              <div className="step-row">
                <span className="step-icon">2</span>
                <span className="step-label">Enriching entities</span>
              </div>
              <span className="step-detail" id="step-enrich-detail"></span>
            </div>
            <div className="pipeline-step" id="step-report">
              <div className="step-row">
                <span className="step-icon">3</span>
                <span className="step-label">Generating report</span>
              </div>
              <span className="step-detail" id="step-report-detail"></span>
            </div>
          </div>
        </div>
        <div className="enrich-progress" id="enrich-progress" hidden>
          <div className="enrich-bar">
            <span className="enrich-label">Re-enriching</span>
            <span className="enrich-detail" id="enrich-detail">
              starting…
            </span>
            <div className="enrich-track">
              <div className="enrich-fill" id="enrich-fill"></div>
            </div>
          </div>
        </div>
      </nav>

      <main className="main">
        <div className="hero-heading">
          <h1>Continuous Intelligence for the AI Startup Landscape</h1>
          <p className="hero-sub">
            Real-time discovery, enrichment, and analysis — powered by agentic
            research.
          </p>
        </div>

        <div className="cluster-viz-wrap">
          <canvas id="cluster-canvas"></canvas>
          <div className="cluster-tooltip" id="cluster-tooltip"></div>
        </div>

        <div className="chat-bar" id="chat-bar">
          <div className="chat-bar-inner">
            <div className="chat-bar-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <input
              type="text"
              className="chat-bar-input"
              id="chat-input"
              placeholder="Ask IntelPilot AI anything…"
              autoComplete="off"
            />
            <button type="button" className="chat-bar-send" id="chat-send">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div className="chat-examples" id="chat-examples"></div>
        </div>

        <div className="toolbar">
          <div className="toolbar-left">
            <h2 className="page-title">Discovered Startups</h2>
            <span className="entity-count" id="entity-count"></span>
          </div>
          <div className="toolbar-right">
            <div className="search-box">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                id="search-input"
                placeholder="Search startups…"
                autoComplete="off"
              />
            </div>
            <select id="filter-category" className="select-filter">
              <option value="">All Categories</option>
            </select>
            <select id="sort-select" className="select-filter">
              <option value="revenue_first">Revenue First</option>
              <option value="updated_at">Recently Updated</option>
              <option value="created_at">Newest First</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </div>

        <div className="entity-grid" id="entity-grid">
          <div className="grid-loading">Loading startups…</div>
        </div>

        <div className="pagination" id="pagination"></div>
      </main>

      <div className="modal-overlay" id="modal-overlay" hidden>
        <div className="modal" id="modal">
          <button className="modal-close" id="modal-close">
            ✕
          </button>
          <div className="modal-body" id="modal-body"></div>
        </div>
      </div>

      <div className="report-modal-overlay" id="report-modal-overlay" hidden>
        <div className="report-modal">
          <div className="report-modal-header">
            <span className="report-modal-title">Intelligence Report</span>
            <div className="report-modal-actions">
              <button className="report-modal-close" id="report-modal-close">
                ✕
              </button>
            </div>
          </div>
          <iframe
            id="report-modal-iframe"
            className="report-modal-iframe"
            src="about:blank"
          ></iframe>
        </div>
      </div>

      <div className="chat-overlay" id="chat-overlay" hidden>
        <div className="chat-modal">
          <div className="chat-header">
            <div className="chat-header-left">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>IntelPilot AI</span>
            </div>
            <button className="chat-close" id="chat-close">
              ✕
            </button>
          </div>
          <div className="chat-messages" id="chat-messages"></div>
          <form className="chat-input-form" id="chat-form">
            <input
              type="text"
              className="chat-modal-input"
              id="chat-modal-input"
              placeholder="Ask a follow-up…"
              autoComplete="off"
            />
            <button type="submit" className="chat-bar-send">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="logo">◆</span>
            <span>IntelPilot</span>
          </div>
          <p className="footer-tagline">
            Agentic intelligence for the AI startup ecosystem.
          </p>
          <div className="footer-links">
            <a href="/report" target="_blank">
              Latest Report
            </a>
            <span className="footer-sep">·</span>
            <a href="/api/health" target="_blank">
              API
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
