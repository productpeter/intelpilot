"use client";

import type { Entity } from "@/types";
import { bestName, metricStr, isPricing, truncDomain, hasFunding } from "@/lib/utils";

interface EntityCardProps {
  entity: Entity;
  onClick: (id: string) => void;
}

export default function EntityCard({ entity, onClick }: EntityCardProps) {
  const name = bestName(entity);
  const category = entity.classification?.category ?? "";
  const oneLiner = entity.classification?.one_liner ?? entity.description ?? "";
  const domain = truncDomain(entity.website_url ?? entity.enrichment?.metrics?.website);
  const metrics = entity.enrichment?.metrics;
  const isVerified = !!entity.enrichment?.web_verified;
  const isEnriched = !!entity.enrichment?.enriched_at;

  const rev = metrics?.revenue;
  const hasRev = !!(rev && !isPricing(rev));
  const revStr = hasRev ? metricStr(rev) : null;

  const fundStr = hasFunding(entity) ? metricStr(metrics?.funding) : null;
  const trafficStr = metrics?.monthly_traffic ? metricStr(metrics.monthly_traffic) : null;
  const usersStr = metrics?.user_count ? metricStr(metrics.user_count) : null;
  const teamStr = metrics?.team_size ? metricStr(metrics.team_size) : null;

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) return;
    onClick(entity._id);
  };

  return (
    <div
      className="entity-card"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!(e.target as HTMLElement).closest("a")) onClick(entity._id);
        }
      }}
    >
      <div className="card-header">
        <h3 className="card-name">{name}</h3>
        {category && <span className="card-category">{category}</span>}
      </div>
      {oneLiner && <p className="card-desc">{oneLiner}</p>}
      <div className="card-metrics">
        {revStr && (
          <span className="metric-badge revenue" title="Revenue">
            💰 {revStr}
          </span>
        )}
        {fundStr && (
          <span className="metric-badge funding" title="Funding">
            🚀 {fundStr}
          </span>
        )}
        {trafficStr && (
          <span className="metric-badge traffic" title="Traffic">
            📊 {trafficStr}
          </span>
        )}
        {usersStr && (
          <span className="metric-badge users" title="Users">
            👥 {usersStr}
          </span>
        )}
        {teamStr && (
          <span className="metric-badge team" title="Team">
            🧑‍💻 {teamStr}
          </span>
        )}
      </div>
      <div className="card-footer">
        {domain && (
          <a
            href={entity.website_url || entity.enrichment?.metrics?.website || `https://${domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="card-url"
            onClick={(e) => e.stopPropagation()}
          >
            {domain}
          </a>
        )}
        <div className="card-badges">
          {isVerified && <span className="badge-verified">Verified</span>}
          {isEnriched && <span className="badge-enriched">Enriched</span>}
          {!isVerified && !isEnriched && <span className="badge-raw">Raw</span>}
        </div>
      </div>
    </div>
  );
}
