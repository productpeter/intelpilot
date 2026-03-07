"use client";

import { useRef, useEffect } from "react";
import { Marked } from "marked";
import type { ChatMessage } from "@/types";

const markedInstance = new Marked({ breaks: true, gfm: true });


interface ChatModalProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSend: (msg: string) => void;
  streaming: boolean;
}

export default function ChatModal({
  open,
  onClose,
  messages,
  onSend,
  streaming,
}: ChatModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = inputRef.current?.value.trim();
    if (!msg) return;
    onSend(msg);
    inputRef.current!.value = "";
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!open) return null;

  const showThinking =
    streaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "user";

  return (
    <div
      className="chat-overlay"
      onClick={handleOverlayClick}
      style={{ display: open ? "flex" : "none" }}
    >
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
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
          <button type="button" className="chat-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role}`}>
              <div className="chat-msg-content">
                {msg.role === "user" ? (
                  msg.content
                ) : (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: markedInstance.parse(msg.content, { async: false }) as string,
                    }}
                  />
                )}
              </div>
            </div>
          ))}
          {showThinking && (
            <div className="chat-msg assistant">
              <div className="chat-msg-content chat-typing">Thinking...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="chat-modal-input"
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
  );
}
