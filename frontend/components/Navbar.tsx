"use client";

import { useState } from "react";

export interface NavbarFeedback {
  text: string;
  type: string;
}

interface NavbarProps {
  online: boolean;
  feedback: NavbarFeedback | null;
  onScan: () => void;
  onEnrich: () => void;
  scanDisabled: boolean;
  enrichDisabled: boolean;
  onChatClick: () => void;
  onHomeClick: () => void;
  pipelineProgress: React.ReactNode;
  enrichProgress: React.ReactNode;
  reportsDropdown: React.ReactNode;
}

export default function Navbar({
  online,
  feedback,
  onScan,
  onEnrich,
  scanDisabled,
  enrichDisabled,
  onChatClick,
  onHomeClick,
  pipelineProgress,
  enrichProgress,
  reportsDropdown,
}: NavbarProps) {
  const [scanTooltipVisible, setScanTooltipVisible] = useState(false);
  const [enrichTooltipVisible, setEnrichTooltipVisible] = useState(false);

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <a href="#" className="nav-brand" onClick={(e) => { e.preventDefault(); onHomeClick(); }}>
          ◆ IntelPilot
        </a>
        <div className={`nav-status ${online ? "pulse" : ""}`}>
          <span className="status-text">{online ? "Online" : "Offline"}</span>
        </div>
        <button
          type="button"
          className="nav-chat-btn"
          onClick={onChatClick}
        >
          Ask AI
        </button>
        <div className="nav-actions">
          <div className="nav-btn-wrap">
            <button
              type="button"
              className="nav-btn"
              onClick={onScan}
              disabled={scanDisabled}
            >
              Scan
            </button>
            <button
              type="button"
              className="help-btn"
              onClick={() => setScanTooltipVisible((v) => !v)}
              aria-label="Scan help"
            >
              ?
            </button>
            {scanTooltipVisible && (
              <span className="btn-tooltip">Scan help tooltip</span>
            )}
          </div>
          <div className="nav-btn-wrap">
            <button
              type="button"
              className="nav-btn"
              onClick={onEnrich}
              disabled={enrichDisabled}
            >
              Re-enrich
            </button>
            <button
              type="button"
              className="help-btn"
              onClick={() => setEnrichTooltipVisible((v) => !v)}
              aria-label="Re-enrich help"
            >
              ?
            </button>
            {enrichTooltipVisible && (
              <span className="btn-tooltip">Re-enrich help tooltip</span>
            )}
          </div>
          {reportsDropdown}
        </div>
      </div>
      {feedback && (
        <div className={`nav-feedback ${feedback.type}`}>
          {feedback.text}
        </div>
      )}
      {pipelineProgress}
      {enrichProgress}
    </nav>
  );
}
