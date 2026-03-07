"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { fetchReports } from "@/lib/api";
import { fmtFull } from "@/lib/utils";
import type { Report } from "@/types";

interface Props {
  onOpenReport: (url: string) => void;
}

export default function ReportsDropdown({ onOpenReport }: Props) {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReports();
      setReports(data);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const next = !open;
      setOpen(next);
      if (next) loadHistory();
    },
    [open, loadHistory]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node) &&
        dropRef.current &&
        !dropRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  return (
    <div className="report-dropdown-wrap" ref={wrapRef}>
      <button className="nav-btn ghost" onClick={toggle}>
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
      {open && (
        <div
          className="report-history-dropdown"
          ref={dropRef}
          style={{ position: "fixed", right: "1rem", width: "340px" }}
        >
          <div className="rhd-list">
            {loading ? (
              <p className="muted">Loading…</p>
            ) : reports.length === 0 ? (
              <p className="muted">No reports generated yet.</p>
            ) : (
              reports.map((r, i) => (
                <div
                  key={r._id}
                  className={`history-item${i === 0 ? " latest" : ""}`}
                >
                  <div className="hi-info">
                    <span className="hi-date">
                      {i === 0 ? "Latest — " : ""}
                      {fmtFull(r.generated_at)}
                    </span>
                    <span className="hi-stats">
                      {r.stats?.entities_in_report || "?"} startups ·{" "}
                      {r.stats?.total_entities_updated || "?"} scanned
                    </span>
                  </div>
                  <button
                    className="hi-link"
                    onClick={() => {
                      onOpenReport(`/report/${r._id}`);
                      setOpen(false);
                    }}
                  >
                    View
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
