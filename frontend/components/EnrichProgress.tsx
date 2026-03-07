"use client";

interface EnrichProgressProps {
  visible: boolean;
  completed: number;
  failed: number;
  total: number;
  detail?: string;
}

export default function EnrichProgress({
  visible,
  completed,
  failed,
  total,
}: EnrichProgressProps) {
  if (!visible) return null;

  const pct = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;
  const detailText = `${completed} done · ${failed} failed / ${total} total (${pct}%)`;

  return (
    <div className="enrich-progress">
      <div className="enrich-bar">
        <span className="enrich-label">Re-enriching</span>
        <span className="enrich-detail">{detailText}</span>
        <div className="enrich-track">
          <div
            className="enrich-fill"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
