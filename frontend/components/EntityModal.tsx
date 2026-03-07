"use client";

import { useEffect, useState, useCallback } from "react";
import type { Entity } from "@/types";
import { fetchEntity } from "@/lib/api";
import { bestName, metricStr, fmt, fmtFull } from "@/lib/utils";

interface EntityModalProps {
  entityId: string | null;
  onClose: () => void;
}

export default function EntityModal({ entityId, onClose }: EntityModalProps) {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEntity = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEntity(id);
      setEntity(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entity");
      setEntity(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (entityId) {
      loadEntity(entityId);
    } else {
      setEntity(null);
      setError(null);
    }
  }, [entityId, loadEntity]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!entityId) return null;

  const evidenceMap = new Map(
    (entity?.evidence ?? []).map((e) => [e._id, e])
  );

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        {loading && (
          <div className="modal-body">
            <p>Loading…</p>
          </div>
        )}

        {error && (
          <div className="modal-body">
            <p className="modal-error">{error}</p>
          </div>
        )}

        {!loading && !error && entity && (
          <div className="modal-body">
            <div className="modal-section">
              <h2 id="modal-title" className="modal-name">
                {bestName(entity)}
              </h2>
              <div className="modal-meta">
                {entity.classification?.category && (
                  <span className="modal-category">{entity.classification.category}</span>
                )}
                {entity.classification?.confidence != null && (
                  <span className="modal-conf">
                    Confidence: {Math.round(entity.classification.confidence * 100)}%
                  </span>
                )}
                <div className="modal-badges">
                  {entity.enrichment?.web_verified && (
                    <span className="modal-verified">Verified</span>
                  )}
                  {entity.enrichment?.enriched_at && (
                    <span className="modal-enriched-badge">Enriched</span>
                  )}
                  {!entity.enrichment?.web_verified && !entity.enrichment?.enriched_at && (
                    <span className="modal-raw-badge">Raw</span>
                  )}
                </div>
              </div>
            </div>

            {(entity.classification?.one_liner || entity.description || entity.enrichment?.metrics?.description) && (
              <div className="modal-section">
                <p className="modal-desc">
                  {entity.classification?.one_liner ||
                    entity.enrichment?.metrics?.description ||
                    entity.description}
                </p>
              </div>
            )}

            {(entity.website_url || entity.enrichment?.metrics?.website) && (
              <div className="modal-section">
                <a
                  href={entity.website_url || entity.enrichment?.metrics?.website || ""}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modal-url"
                >
                  {entity.website_url || entity.enrichment?.metrics?.website} ↗
                </a>
              </div>
            )}

            <div className="modal-section">
              <h3>Metrics</h3>
              <div className="metrics-grid">
                {entity.enrichment?.metrics?.revenue && (
                  <div className="metric-card">
                    <span className="metric-label">Revenue</span>
                    <span className="metric-value">{metricStr(entity.enrichment.metrics.revenue)}</span>
                    {entity.enrichment.metrics.revenue_source && (
                      <a
                        href={entity.enrichment.metrics.revenue_source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="metric-source-link"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                )}
                {entity.enrichment?.metrics?.funding && (
                  <div className="metric-card">
                    <span className="metric-label">Funding</span>
                    <span className="metric-value">{metricStr(entity.enrichment.metrics.funding)}</span>
                    {entity.enrichment.metrics.funding_source && (
                      <a
                        href={entity.enrichment.metrics.funding_source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="metric-source-link"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                )}
                {entity.enrichment?.metrics?.monthly_traffic && (
                  <div className="metric-card">
                    <span className="metric-label">Traffic</span>
                    <span className="metric-value">{metricStr(entity.enrichment.metrics.monthly_traffic)}</span>
                    {entity.enrichment.metrics.monthly_traffic_source && (
                      <a
                        href={entity.enrichment.metrics.monthly_traffic_source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="metric-source-link"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                )}
                {entity.enrichment?.metrics?.user_count && (
                  <div className="metric-card">
                    <span className="metric-label">Users</span>
                    <span className="metric-value">{metricStr(entity.enrichment.metrics.user_count)}</span>
                    {entity.enrichment.metrics.user_count_source && (
                      <a
                        href={entity.enrichment.metrics.user_count_source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="metric-source-link"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                )}
                {entity.enrichment?.metrics?.team_size && (
                  <div className="metric-card">
                    <span className="metric-label">Team Size</span>
                    <span className="metric-value">{metricStr(entity.enrichment.metrics.team_size)}</span>
                    {entity.enrichment.metrics.team_size_source && (
                      <a
                        href={entity.enrichment.metrics.team_size_source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="metric-source-link"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                )}
                {entity.enrichment?.metrics?.growth && (
                  <div className="metric-card">
                    <span className="metric-label">Growth</span>
                    <span className="metric-value">{metricStr(entity.enrichment.metrics.growth)}</span>
                    {entity.enrichment.metrics.growth_source && (
                      <a
                        href={entity.enrichment.metrics.growth_source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="metric-source-link"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                )}
                {entity.enrichment?.metrics?.founded_year && (
                  <div className="metric-card">
                    <span className="metric-label">Founded</span>
                    <span className="metric-value">{entity.enrichment.metrics.founded_year}</span>
                  </div>
                )}
              </div>
            </div>

            {entity.enrichment?.metrics?.notable && (
              <div className="modal-section">
                <h3>Notable</h3>
                <p>{entity.enrichment.metrics.notable}</p>
              </div>
            )}

            {entity.enrichment?.metrics?.tech_stack && (
              <div className="modal-section">
                <h3>Tech Stack</h3>
                <div className="tech-stack-tags">
                  {entity.enrichment.metrics.tech_stack
                    .split(/[,;|]/)
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((tag, i) => (
                      <span key={i} className="tech-stack-tag">
                        {tag}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {(entity.enrichment?.recent_news?.length ?? 0) > 0 && (
              <div className="modal-section">
                <h3>Recent News</h3>
                <ul className="news-list">
                  {entity.enrichment!.recent_news.map((n, i) => (
                    <li key={i}>
                      <a href={n.url} target="_blank" rel="noopener noreferrer">
                        {n.title}
                      </a>
                      {n.date && <span className="news-date"> — {fmt(n.date)}</span>}
                      {n.summary && <p className="news-summary">{n.summary}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(entity.discoveries?.length ?? 0) > 0 && (
              <div className="modal-section">
                <h3>Source Mentions</h3>
                <ul className="discovery-list">
                  {entity.discoveries!.map((d, i) => (
                    <li key={i}>
                      <a href={d.candidate_url} target="_blank" rel="noopener noreferrer">
                        {d.title}
                      </a>
                      {d.meta?.subreddit && (
                        <span className="disc-tag">r/{d.meta.subreddit}</span>
                      )}
                      {d.meta?.feed_label && (
                        <span className="disc-tag">{d.meta.feed_label}</span>
                      )}
                      {d.discovered_at && (
                        <span className="disc-date"> — {fmt(d.discovered_at)}</span>
                      )}
                      {d.meta?.snippet && <p>{d.meta.snippet}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(entity.signals?.length ?? 0) > 0 && (
              <div className="modal-section">
                <h3>Signals</h3>
                <ul className="signal-list">
                  {entity.signals!.map((s, i) => {
                    const ev = s.evidence_id ? evidenceMap.get(s.evidence_id) : null;
                    return (
                      <li key={i}>
                        <span className="signal-type">{s.signal_type}</span>: {s.value_text}
                        {ev && (
                          <a
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="evidence-link"
                          >
                            ↗
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {(entity.evidence?.length ?? 0) > 0 && (
              <div className="modal-section">
                <h3>Evidence</h3>
                <ul className="evidence-list">
                  {entity.evidence!.map((e) => (
                    <li key={e._id}>
                      <a href={e.url} target="_blank" rel="noopener noreferrer" className="evidence-link">
                        {e.url}
                      </a>
                      {e.snippet && <p className="evidence-snippet">{e.snippet}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="modal-section modal-timestamps">
              <p>Created: {fmtFull(entity.created_at)}</p>
              <p>Updated: {fmtFull(entity.updated_at)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
