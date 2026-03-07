"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { ClusterNode } from "@/types";
import { fetchClusterMap } from "@/lib/api";

const SPRING = 0.001;
const PERTURB = 0.008;
const DAMP = 0.99;
const CONNECTION_RADIUS = 40;
const TOOLTIP_MARGIN = 8;

const CATEGORY_COLORS: Record<string, string> = {
  "AI SaaS": "#6366f1",
  "AI Agent": "#a855f7",
  "AI Developer Tools": "#3b82f6",
  "AI Healthcare": "#22c55e",
  "AI Finance": "#eab308",
  "AI Research": "#06b6d4",
  "AI Infrastructure": "#f97316",
  "AI EdTech": "#ec4899",
  "AI Marketing": "#14b8a6",
  "AI Media": "#f43f5e",
  "LLM Tool": "#8b5cf6",
  "AI Video": "#ef4444",
  "AI Design": "#d946ef",
  "AI Security": "#0ea5e9",
  "AI E-commerce": "#84cc16",
};
const DEFAULT_COLOR = "#6366f1";

interface VizNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  r: number;
  name: string;
  category: string;
  revenue: string | null;
  funding: string | null;
  traffic: string | null;
  tech_stack: string | null;
  color: string;
  hasRevenue: boolean;
}

interface ClusterCenter {
  x: number;
  y: number;
  category: string;
  color: string;
  count: number;
}

interface ClusterVizProps {
  onEntityClick: (id: string) => void;
}

export default function ClusterViz({ onEntityClick }: ClusterVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<VizNode[]>([]);
  const [centers, setCenters] = useState<ClusterCenter[]>([]);
  const [tooltipNode, setTooltipNode] = useState<VizNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const rafRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const rawDataRef = useRef<ClusterNode[]>([]);
  const DOUBLE_TAP_MS = 400;

  const buildNodes = useCallback(
    (data: ClusterNode[], W: number, H: number) => {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 500;
      const pad = isMobile ? 10 : 30;
      const scale = isMobile ? 0.55 : 1;
      const minX = pad;
      const minY = pad;
      const rangeX = Math.max(1, W - pad * 2);
      const rangeY = Math.max(1, H - pad * 2);

      const categorySums: Record<
        string,
        { sumX: number; sumY: number; count: number }
      > = {};

      const vizNodes: VizNode[] = data.map((d) => {
        const baseX = minX + d.x * rangeX;
        const baseY = minY + d.y * rangeY;
        let r = 2.5;
        if (d.revenue && d.revenue.trim()) r = 5.5;
        else if (d.funding && d.funding.trim()) r = 4;
        r *= scale;

        const category = d.category || "Other";
        if (!categorySums[category]) {
          categorySums[category] = { sumX: 0, sumY: 0, count: 0 };
        }
        categorySums[category].sumX += baseX;
        categorySums[category].sumY += baseY;
        categorySums[category].count += 1;

        const color = CATEGORY_COLORS[category] ?? DEFAULT_COLOR;
        return {
          id: d._id,
          x: baseX,
          y: baseY,
          vx: 0,
          vy: 0,
          baseX,
          baseY,
          r,
          name: d.name,
          category,
          revenue: d.revenue,
          funding: d.funding,
          traffic: d.traffic,
          tech_stack: d.tech_stack,
          color,
          hasRevenue: !!(d.revenue && d.revenue.trim()),
        };
      });

      const clusterCenters: ClusterCenter[] = Object.entries(categorySums).map(
        ([category, { sumX, sumY, count }]) => ({
          x: sumX / count,
          y: sumY / count,
          category,
          color: CATEGORY_COLORS[category] ?? DEFAULT_COLOR,
          count,
        })
      );

      rawDataRef.current = data;
      setNodes(vizNodes);
      setCenters(clusterCenters);
    },
    []
  );

  const draw = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      vizNodes: VizNode[],
      clusterCenters: ClusterCenter[],
      W: number,
      H: number
    ) => {
      ctx.clearRect(0, 0, W, H);

      // Radial gradients at cluster centers
      for (const c of clusterCenters) {
        const grad = ctx.createRadialGradient(
          c.x,
          c.y,
          0,
          c.x,
          c.y,
          120
        );
        grad.addColorStop(0, c.color + "20");
        grad.addColorStop(1, c.color + "00");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // Connections between same-category nodes within 40px
      ctx.strokeStyle = "rgba(100,100,100,0.15)";
      ctx.lineWidth = 1;
      for (let i = 0; i < vizNodes.length; i++) {
        const a = vizNodes[i];
        for (let j = i + 1; j < vizNodes.length; j++) {
          const b = vizNodes[j];
          if (a.category !== b.category) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (dx * dx + dy * dy < CONNECTION_RADIUS * CONNECTION_RADIUS) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Nodes
      for (const n of vizNodes) {
        if (n.hasRevenue) {
          const glow = ctx.createRadialGradient(
            n.x,
            n.y,
            0,
            n.x,
            n.y,
            n.r * 3
          );
          glow.addColorStop(0, n.color + "60");
          glow.addColorStop(1, n.color + "00");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Category labels
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const c of clusterCenters) {
        ctx.fillStyle = c.color;
        ctx.fillText(c.category, c.x, c.y - 8);
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillText(String(c.count), c.x, c.y + 6);
        ctx.font = "bold 13px system-ui, sans-serif";
      }
    },
    []
  );

  const update = useCallback((vizNodes: VizNode[]) => {
    for (const n of vizNodes) {
      n.vx += (n.baseX - n.x) * SPRING + (Math.random() - 0.5) * PERTURB;
      n.vy += (n.baseY - n.y) * SPRING + (Math.random() - 0.5) * PERTURB;
      n.vx *= DAMP;
      n.vy *= DAMP;
      n.x += n.vx;
      n.y += n.vy;
    }
  }, []);

  const positionTooltip = useCallback(
    (node: VizNode, W: number, H: number) => {
      const tt = tooltipRef.current;
      if (!tt) return;
      const margin = TOOLTIP_MARGIN;
      const nodeOffset = 12;
      let x = node.x + node.r + nodeOffset;
      let y = node.y;

      const tw = tt.offsetWidth;
      const th = tt.offsetHeight;

      if (x + tw + margin > W) x = node.x - node.r - tw - nodeOffset;
      if (x < margin) x = margin;
      if (y + th + margin > H) y = H - th - margin;
      if (y < margin) y = margin;

      setTooltipPos({ x, y });
    },
    []
  );

  const getNodeAt = useCallback(
    (clientX: number, clientY: number): VizNode | null => {
      const canvas = canvasRef.current;
      const wrapper = wrapperRef.current;
      if (!canvas || !wrapper || nodes.length === 0) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;

      let best: VizNode | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(x - n.x, y - n.y);
        if (d <= n.r + 4 && d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    },
    [nodes]
  );

  const showTooltipFor = useCallback(
    (node: VizNode) => {
      setTooltipNode(node);
      positionTooltip(node, dimensions.w, dimensions.h);
    },
    [dimensions, positionTooltip]
  );

  const hideTooltip = useCallback(() => {
    setTooltipNode(null);
  }, []);

  const handleResize = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    setDimensions({ w, h });
    if (rawDataRef.current.length > 0) {
      buildNodes(rawDataRef.current, w, h);
    }
  }, [buildNodes]);

  useEffect(() => {
    let cancelled = false;
    fetchClusterMap()
      .then((res) => {
        if (cancelled) return;
        const W = wrapperRef.current?.clientWidth ?? 800;
        const H = wrapperRef.current?.clientHeight ?? 600;
        setDimensions({ w: W, h: H });
        buildNodes(res.nodes, W, H);
      })
      .catch(() => {
        if (!cancelled) setNodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [buildNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const W = dimensions.w;
    const H = dimensions.h;
    if (W <= 0 || H <= 0) return;

    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let vizNodes = [...nodes];
    if (vizNodes.length === 0) return;

    const loop = () => {
      update(vizNodes);
      draw(ctx, vizNodes, centers, W, H);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [nodes, centers, dimensions, draw, update]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(handleResize);
    ro.observe(wrapper);
    handleResize();
    return () => ro.disconnect();
  }, [handleResize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const onMouseMove = (e: MouseEvent) => {
      const node = getNodeAt(e.clientX, e.clientY);
      if (node) {
        showTooltipFor(node);
      } else {
        hideTooltip();
      }
    };

    const onMouseLeave = () => hideTooltip();

    const onMouseDown = (e: MouseEvent) => {
      const node = getNodeAt(e.clientX, e.clientY);
      if (node) onEntityClick(node.id);
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const node = getNodeAt(t.clientX, t.clientY);
      const now = Date.now();
      const last = lastTapRef.current;
      if (node) {
        if (last && last.id === node.id && now - last.time < DOUBLE_TAP_MS) {
          lastTapRef.current = null;
          onEntityClick(node.id);
        } else {
          lastTapRef.current = { id: node.id, time: now };
          showTooltipFor(node);
        }
      } else {
        lastTapRef.current = null;
        hideTooltip();
      }
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("mousedown", onMouseDown);
    wrapper.addEventListener("touchstart", onTouchStart, { passive: true });

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("mousedown", onMouseDown);
      wrapper.removeEventListener("touchstart", onTouchStart);
    };
  }, [
    nodes,
    getNodeAt,
    showTooltipFor,
    hideTooltip,
    onEntityClick,
  ]);

  useEffect(() => {
    if (tooltipNode && dimensions.w > 0 && dimensions.h > 0) {
      positionTooltip(tooltipNode, dimensions.w, dimensions.h);
    }
  }, [tooltipNode, dimensions, positionTooltip]);

  const metric =
    tooltipNode?.revenue?.trim() ||
    tooltipNode?.funding?.trim() ||
    tooltipNode?.traffic?.trim() ||
    "—";

  return (
    <div
      ref={wrapperRef}
      className="cluster-viz-wrap"
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      <div
        ref={tooltipRef}
        className="cluster-tooltip"
        style={{
          display: tooltipNode ? "block" : "none",
          position: "absolute",
          left: tooltipPos.x,
          top: tooltipPos.y,
          pointerEvents: "none",
        }}
      >
        <span className="tt-name">{tooltipNode?.name ?? ""}</span>
        <span className="tt-cat">{tooltipNode?.category ?? ""}</span>
        <span className="tt-metric">{metric}</span>
      </div>
    </div>
  );
}
