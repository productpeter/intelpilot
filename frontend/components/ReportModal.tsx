"use client";

import { useEffect, useCallback } from "react";

interface Props {
  url: string | null;
  onClose: () => void;
}

export default function ReportModal({ url, onClose }: Props) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!url) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [url, handleKey]);

  if (!url) return null;

  return (
    <div
      className="report-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="report-modal">
        <div className="report-modal-header">
          <span className="report-modal-title">Intelligence Report</span>
          <div className="report-modal-actions">
            <button className="report-modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        <iframe className="report-modal-iframe" src={url} />
      </div>
    </div>
  );
}
