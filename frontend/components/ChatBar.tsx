"use client";

import { useState, useEffect, useCallback } from "react";

const EXAMPLE_QUESTIONS = [
  "Which startups raised the most funding?",
  "Compare AI video generation companies",
  "What startups use React in their stack?",
  "Which YC companies are in the database?",
  "Show me startups with the most traffic",
  "What are the fastest growing startups?",
  "Which companies have the most employees?",
  "Find startups in the NLP space",
  "Who are the solo founder startups?",
  "What startups were founded in 2024?",
  "Which startups have revenue data?",
  "Compare the top-funded AI startups",
];

interface ChatBarProps {
  onSend: (msg: string) => void;
  visible: boolean;
}

export default function ChatBar({ onSend, visible }: ChatBarProps) {
  const [input, setInput] = useState("");
  const [exampleIdx, setExampleIdx] = useState(0);

  const getExampleCount = useCallback(() => {
    if (typeof window === "undefined") return 3;
    return window.innerWidth < 500 ? 2 : 3;
  }, []);

  const getCurrentExamples = useCallback(() => {
    const count = getExampleCount();
    return Array.from({ length: count }, (_, i) =>
      EXAMPLE_QUESTIONS[(exampleIdx + i) % EXAMPLE_QUESTIONS.length]
    );
  }, [exampleIdx, getExampleCount]);

  useEffect(() => {
    const interval = setInterval(() => {
      setExampleIdx((prev) => (prev + getExampleCount()) % EXAMPLE_QUESTIONS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [getExampleCount]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg) return;
    onSend(msg);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  if (!visible) return null;

  return (
    <div className="chat-bar">
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
          placeholder="Ask IntelPilot AI anything…"
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="chat-bar-send" onClick={handleSend}>
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
      <div className="chat-examples">
        {getCurrentExamples().map((q) => (
          <button
            key={q}
            type="button"
            className="chat-example-chip"
            onClick={() => onSend(q)}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
