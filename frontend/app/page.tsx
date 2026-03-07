"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Navbar from "@/components/Navbar";
import PipelineProgress, {
  type PipelineStep,
  type StepState,
} from "@/components/PipelineProgress";
import EnrichProgress from "@/components/EnrichProgress";
import HeroSection from "@/components/HeroSection";
import ClusterViz from "@/components/ClusterViz";
import ChatBar from "@/components/ChatBar";
import ChatModal from "@/components/ChatModal";
import Toolbar from "@/components/Toolbar";
import EntityGrid from "@/components/EntityGrid";
import EntityModal from "@/components/EntityModal";
import ReportsDropdown from "@/components/ReportsDropdown";
import ReportModal from "@/components/ReportModal";
import Footer from "@/components/Footer";
import {
  fetchEntities,
  fetchHealth,
  fetchJobs,
  fetchScanStatus,
  triggerScan,
  triggerReEnrich,
  sendChatMessage,
} from "@/lib/api";
import { hasRevenue, hasFunding, hasAnyMetric, isPricing } from "@/lib/utils";
import type { Entity, ChatMessage } from "@/types";

export default function Home() {
  // Health
  const [online, setOnline] = useState(false);

  // Entities
  const [entities, setEntities] = useState<Entity[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentSort, setCurrentSort] = useState("revenue_first");
  const [currentCategory, setCurrentCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Feedback
  const [feedback, setFeedback] = useState<{
    text: string;
    type: string;
  } | null>(null);

  // Pipeline
  const [scanDisabled, setScanDisabled] = useState(false);
  const [enrichDisabled, setEnrichDisabled] = useState(false);
  const [pipelineVisible, setPipelineVisible] = useState(false);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    { id: "scan", label: "Scanning sources", state: "", detail: "waiting" },
    { id: "enrich", label: "Enriching entities", state: "", detail: "waiting" },
    {
      id: "report",
      label: "Generating report",
      state: "",
      detail: "waiting",
    },
  ]);

  // Enrich progress
  const [enrichVisible, setEnrichVisible] = useState(false);
  const [enrichCompleted, setEnrichCompleted] = useState(0);
  const [enrichFailed, setEnrichFailed] = useState(0);
  const [enrichTotal, setEnrichTotal] = useState(0);

  // Modals
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [reportUrl, setReportUrl] = useState<string | null>(null);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);

  // Refs for polling timers
  const pipelineTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const enrichTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pipelineState = useRef({
    scanDone: false,
    enrichDone: false,
    reportDone: false,
    emptyPolls: 0,
  });

  // ── Data Loading ──
  const loadEntities = useCallback(async () => {
    try {
      const apiSort =
        currentSort === "revenue_first" ? "updated_at" : currentSort;
      const res = await fetchEntities(apiSort, 1000);
      setEntities(res.data || []);
    } catch {
      setEntities([]);
    }
  }, [currentSort]);

  const checkHealth = useCallback(async () => {
    try {
      await fetchHealth();
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  // ── Filtering & Sorting ──
  const getFiltered = useCallback(() => {
    let filtered = entities;
    if (currentCategory) {
      filtered = filtered.filter(
        (e) => e.classification?.category === currentCategory
      );
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          (e.name || "").toLowerCase().includes(q) ||
          (e.enrichment?.metrics?.matched_name || "").toLowerCase().includes(q) ||
          (e.description || "").toLowerCase().includes(q) ||
          (e.classification?.one_liner || "").toLowerCase().includes(q) ||
          (e.classification?.category || "").toLowerCase().includes(q)
      );
    }
    if (currentSort === "revenue_first") {
      filtered = [...filtered].sort((a, b) => {
        const ra = hasRevenue(a) ? 3 : hasFunding(a) ? 2 : hasAnyMetric(a) ? 1 : 0;
        const rb = hasRevenue(b) ? 3 : hasFunding(b) ? 2 : hasAnyMetric(b) ? 1 : 0;
        if (rb !== ra) return rb - ra;
        return (
          new Date(b.updated_at || 0).getTime() -
          new Date(a.updated_at || 0).getTime()
        );
      });
    }
    return filtered;
  }, [entities, currentCategory, searchQuery, currentSort]);

  const categories = Array.from(
    new Set(entities.map((e) => e.classification?.category).filter(Boolean))
  ).sort() as string[];

  const filtered = getFiltered();
  const isHome = currentPage === 1;

  // ── Pipeline Polling ──
  const setStepState = useCallback(
    (stepId: string, state: StepState, detail: string) => {
      setPipelineSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, state, detail } : s))
      );
    },
    []
  );

  const stopPipelinePolling = useCallback(() => {
    if (pipelineTimer.current) {
      clearInterval(pipelineTimer.current);
      pipelineTimer.current = null;
    }
  }, []);

  const pollPipeline = useCallback(async () => {
    const ps = pipelineState.current;
    try {
      const [scanData, jobs] = await Promise.all([
        fetchScanStatus(),
        fetchJobs(),
      ]);

      if (!ps.scanDone) {
        const c = scanData.counts || {};
        const sj = jobs.scan;
        const scanDone = sj?.status === "done" || sj?.status === "error";
        const detail = c.new_candidates
          ? `${c.candidates || 0} sources crawled · ${c.new_candidates} unseen · ${c.success || 0} extracted`
          : `${c.candidates || 0} sources crawled · ${c.success || 0} extracted`;

        if (scanDone) {
          setStepState("scan", "done", detail);
          ps.scanDone = true;
          loadEntities();
        } else if (sj?.status === "running" || scanData.is_running) {
          setStepState("scan", "active", detail);
        }
      }

      if (ps.scanDone && !ps.enrichDone) {
        const ej = jobs.enrich;
        if (ej?.status === "running") {
          ps.emptyPolls = 0;
          setStepState(
            "enrich",
            "active",
            `${ej.completed || 0}/${ej.total || "?"} done`
          );
        } else if (ej?.status === "done") {
          const msg =
            typeof ej.message === "string"
              ? ej.message
              : (ej.message as { message?: string })?.message || "complete";
          setStepState("enrich", "done", msg);
          ps.enrichDone = true;
          loadEntities();
        } else if (ej?.status === "error") {
          setStepState("enrich", "error", "failed");
          ps.enrichDone = true;
        } else {
          ps.emptyPolls++;
          if (ps.emptyPolls > 6) {
            setStepState("enrich", "done", "complete");
            ps.enrichDone = true;
          } else {
            setStepState("enrich", "active", "starting…");
          }
        }
      }

      if (ps.scanDone && ps.enrichDone && !ps.reportDone) {
        const rj = jobs.report;
        if (rj?.status === "running") {
          ps.emptyPolls = 0;
          setStepState(
            "report",
            "active",
            (rj.message as string) || "generating…"
          );
        } else if (rj?.status === "done") {
          const msg =
            typeof rj.message === "string"
              ? rj.message
              : (rj.message as { message?: string })?.message || "complete";
          setStepState("report", "done", msg);
          ps.reportDone = true;
          loadEntities();
        } else if (rj?.status === "error") {
          setStepState("report", "error", "failed");
          ps.reportDone = true;
        } else {
          ps.emptyPolls++;
          if (ps.emptyPolls > 6) {
            setStepState("report", "done", "complete");
            ps.reportDone = true;
            loadEntities();
          } else {
            setStepState("report", "active", "starting…");
          }
        }
      }

      if (ps.scanDone && ps.enrichDone && ps.reportDone) {
        const rMsg = jobs.report?.message;
        const noReport =
          typeof rMsg === "string" && rMsg.toLowerCase().includes("no new");
        setFeedback({
          text: noReport
            ? "Pipeline complete — no new startups found this scan"
            : "Pipeline complete — scan, enrich & report done",
          type: noReport ? "info" : "success",
        });
        setScanDisabled(false);
        stopPipelinePolling();
        setTimeout(() => {
          setPipelineVisible(false);
          setFeedback(null);
        }, 12000);
      }
    } catch {
      stopPipelinePolling();
    }
  }, [setStepState, stopPipelinePolling, loadEntities]);

  const startPipelinePolling = useCallback(() => {
    if (pipelineTimer.current) return;
    pipelineTimer.current = setInterval(pollPipeline, 3000);
    setTimeout(pollPipeline, 800);
  }, [pollPipeline]);

  // ── Enrich Polling ──
  const stopEnrichPolling = useCallback(() => {
    if (enrichTimer.current) {
      clearInterval(enrichTimer.current);
      enrichTimer.current = null;
    }
  }, []);

  const pollEnrich = useCallback(async () => {
    try {
      const jobs = await fetchJobs();
      const ej = jobs["re-enrich"];
      if (ej?.status === "running") {
        setEnrichCompleted(ej.completed || 0);
        setEnrichFailed(ej.failed || 0);
        setEnrichTotal(ej.total || 0);
      } else if (ej?.status === "done") {
        setEnrichCompleted(ej.total || 0);
        setEnrichTotal(ej.total || 0);
        setFeedback({ text: "Re-enrichment complete", type: "success" });
        setEnrichDisabled(false);
        stopEnrichPolling();
        loadEntities();
        setTimeout(() => {
          setEnrichVisible(false);
          setFeedback(null);
        }, 8000);
      } else if (ej?.status === "error") {
        setFeedback({ text: "Re-enrichment failed", type: "error" });
        setEnrichDisabled(false);
        stopEnrichPolling();
        setTimeout(() => {
          setEnrichVisible(false);
          setFeedback(null);
        }, 5000);
      }
    } catch {
      stopEnrichPolling();
    }
  }, [stopEnrichPolling, loadEntities]);

  const startEnrichPolling = useCallback(() => {
    if (enrichTimer.current) return;
    enrichTimer.current = setInterval(pollEnrich, 3000);
    setTimeout(pollEnrich, 800);
  }, [pollEnrich]);

  // ── Actions ──
  const handleScan = useCallback(async () => {
    setScanDisabled(true);
    setFeedback({ text: "Scan underway…", type: "loading" });
    pipelineState.current = {
      scanDone: false,
      enrichDone: false,
      reportDone: false,
      emptyPolls: 0,
    };
    setPipelineSteps([
      {
        id: "scan",
        label: "Scanning sources",
        state: "active",
        detail: "starting…",
      },
      {
        id: "enrich",
        label: "Enriching entities",
        state: "",
        detail: "waiting",
      },
      {
        id: "report",
        label: "Generating report",
        state: "",
        detail: "waiting",
      },
    ]);
    setPipelineVisible(true);
    try {
      await triggerScan();
      startPipelinePolling();
    } catch (err) {
      setFeedback({
        text: `Scan error: ${(err as Error).message}`,
        type: "error",
      });
      setScanDisabled(false);
      setPipelineVisible(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  }, [startPipelinePolling]);

  const handleEnrich = useCallback(async () => {
    if (
      !confirm(
        "Re-enrich all startup entities? This will update metrics, evidence links, and news for every entity."
      )
    )
      return;
    setEnrichDisabled(true);
    setFeedback({ text: "Re-enrichment underway…", type: "loading" });
    setEnrichVisible(true);
    setEnrichCompleted(0);
    setEnrichFailed(0);
    setEnrichTotal(0);
    try {
      const res = await triggerReEnrich();
      if (res.count > 0) {
        setFeedback({
          text: `Re-enrichment underway — ${res.count} entities…`,
          type: "loading",
        });
        startEnrichPolling();
      } else {
        setFeedback({ text: "No entities to enrich", type: "info" });
        setEnrichDisabled(false);
        setEnrichVisible(false);
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err) {
      setFeedback({
        text: `Enrich error: ${(err as Error).message}`,
        type: "error",
      });
      setEnrichDisabled(false);
      setEnrichVisible(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  }, [startEnrichPolling]);

  // ── Chat ──
  const handleChatSend = useCallback(
    async (msg: string) => {
      if (!msg || chatStreaming) return;
      if (!chatOpen) setChatOpen(true);

      const userMsg: ChatMessage = { role: "user", content: msg };
      setChatMessages((prev) => [...prev, userMsg]);
      setChatStreaming(true);

      try {
        const res = await sendChatMessage(msg, [
          ...chatMessages.slice(-10),
          userMsg,
        ]);

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error || `HTTP ${res.status}`
          );
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");
        const decoder = new TextDecoder();
        let fullText = "";
        let sseBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") break;
            try {
              const { token, error } = JSON.parse(payload);
              if (error) throw new Error(error);
              if (token) {
                fullText += token;
                setChatMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return [
                      ...prev.slice(0, -1),
                      { role: "assistant" as const, content: fullText },
                    ];
                  }
                  return [
                    ...prev,
                    { role: "assistant" as const, content: fullText },
                  ];
                });
              }
            } catch {
              // skip malformed SSE
            }
          }
        }

        if (!fullText) {
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: "No response received." },
          ]);
        }
      } catch (err) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${(err as Error).message}`,
          },
        ]);
      } finally {
        setChatStreaming(false);
      }
    },
    [chatStreaming, chatOpen, chatMessages]
  );

  // ── Check for running pipeline on load ──
  const checkRunningPipeline = useCallback(async () => {
    try {
      const [scanData, jobs] = await Promise.all([
        fetchScanStatus(),
        fetchJobs(),
      ]);

      const reEnrichRunning = jobs["re-enrich"]?.status === "running";
      if (reEnrichRunning) {
        setEnrichDisabled(true);
        setEnrichVisible(true);
        const ej = jobs["re-enrich"];
        setEnrichCompleted(ej.completed || 0);
        setEnrichFailed(ej.failed || 0);
        setEnrichTotal(ej.total || 0);
        startEnrichPolling();
      }

      const scanRunning =
        jobs.scan?.status === "running" || scanData.is_running;
      const enrichRunning = jobs.enrich?.status === "running";
      const reportRunning = jobs.report?.status === "running";

      if (!scanRunning && !enrichRunning && !reportRunning) return;

      setScanDisabled(true);
      setPipelineVisible(true);
      const ps = pipelineState.current;

      if (scanRunning && !enrichRunning && !reportRunning) {
        ps.scanDone = false;
        ps.enrichDone = false;
        ps.reportDone = false;
        const c = scanData.counts || {};
        const detail = c.new_candidates
          ? `${c.candidates || 0} sources crawled · ${c.new_candidates} unseen · ${c.success || 0} extracted`
          : `${c.candidates || 0} sources crawled · ${c.success || 0} extracted`;
        setStepState("scan", "active", detail);
      } else if (enrichRunning) {
        ps.scanDone = true;
        ps.enrichDone = false;
        ps.reportDone = false;
        setStepState("scan", "done", "complete");
        const ej = jobs.enrich;
        setStepState(
          "enrich",
          "active",
          `${ej.completed || 0}/${ej.total || "?"} done`
        );
      } else if (reportRunning) {
        ps.scanDone = true;
        ps.enrichDone = true;
        ps.reportDone = false;
        setStepState("scan", "done", "complete");
        setStepState("enrich", "done", "complete");
        setStepState(
          "report",
          "active",
          (jobs.report.message as string) || "generating…"
        );
      }

      setFeedback({ text: "Pipeline underway…", type: "loading" });
      startPipelinePolling();
    } catch {
      // no running pipeline
    }
  }, [setStepState, startPipelinePolling, startEnrichPolling]);

  // ── Initial Load ──
  useEffect(() => {
    checkHealth();
    loadEntities();
    checkRunningPipeline();
    const healthInterval = setInterval(checkHealth, 30000);
    return () => clearInterval(healthInterval);
  }, [checkHealth, loadEntities, checkRunningPipeline]);

  // Reload entities when sort changes
  useEffect(() => {
    if (currentSort !== "revenue_first") {
      loadEntities();
    }
  }, [currentSort, loadEntities]);

  const handleHomeClick = useCallback(() => {
    setCurrentPage(1);
    setSearchQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleChatClick = useCallback(() => {
    if (isHome) {
      const el = document.getElementById("chat-bar-wrap");
      if (el) {
        const input = el.querySelector("input");
        input?.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    setChatOpen(true);
  }, [isHome]);

  return (
    <>
      <Navbar
        online={online}
        feedback={feedback}
        onScan={handleScan}
        onEnrich={handleEnrich}
        scanDisabled={scanDisabled}
        enrichDisabled={enrichDisabled}
        onChatClick={handleChatClick}
        onHomeClick={handleHomeClick}
        pipelineProgress={
          <PipelineProgress
            visible={pipelineVisible}
            steps={pipelineSteps}
          />
        }
        enrichProgress={
          <EnrichProgress
            visible={enrichVisible}
            completed={enrichCompleted}
            failed={enrichFailed}
            total={enrichTotal}
          />
        }
        reportsDropdown={
          <ReportsDropdown onOpenReport={(url) => setReportUrl(url)} />
        }
      />

      <main className="main">
        {isHome && (
          <>
            <HeroSection />
            <ClusterViz onEntityClick={(id) => setSelectedEntityId(id)} />
            <div id="chat-bar-wrap">
              <ChatBar onSend={handleChatSend} visible={true} />
            </div>
          </>
        )}

        <Toolbar
          totalCount={filtered.length}
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            setCurrentPage(1);
          }}
          categories={categories}
          selectedCategory={currentCategory}
          onCategoryChange={(cat) => {
            setCurrentCategory(cat);
            setCurrentPage(1);
          }}
          sortValue={currentSort}
          onSortChange={(sort) => {
            setCurrentSort(sort);
            setCurrentPage(1);
          }}
        />

        <EntityGrid
          entities={filtered}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onEntityClick={(id) => setSelectedEntityId(id)}
        />
      </main>

      <EntityModal
        entityId={selectedEntityId}
        onClose={() => setSelectedEntityId(null)}
      />

      <ReportModal url={reportUrl} onClose={() => setReportUrl(null)} />

      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={chatMessages}
        onSend={handleChatSend}
        streaming={chatStreaming}
      />

      <Footer />
    </>
  );
}
