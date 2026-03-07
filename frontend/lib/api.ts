/**
 * API helper functions for the IntelPilot dashboard.
 * All paths are relative /api/... and go through Next.js rewrites to the backend.
 */

import type {
  Entity,
  ClusterNode,
  JobsResponse,
  Report,
} from "@/types";

// =============================================================================
// Response types (not in shared types)
// =============================================================================

export interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  db?: "connected" | "disconnected";
  scan_cron?: string;
}

export interface EntitiesResponse {
  data: Entity[];
  total: number;
  limit: number;
  skip: number;
}

export interface ClusterMapResponse {
  nodes: ClusterNode[];
  count: number;
}

export interface ScanRunResponse {
  message: string;
  status: string;
}

export interface ReEnrichResponse {
  message: string;
  count: number;
}

// =============================================================================
// Generic API helper
// =============================================================================

/**
 * Generic API helper that prepends /api to the path, sets JSON headers for POST,
 * and throws on non-ok response.
 */
export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `/api${path.startsWith("/") ? path : `/${path}`}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined && (method === "POST" || method === "PUT" || method === "PATCH")) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    let errMsg = text;
    try {
      const json = JSON.parse(text);
      errMsg = json.error ?? json.message ?? text;
    } catch {
      // use raw text
    }
    throw new Error(errMsg || `API error ${res.status}`);
  }
  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as T;
}

// =============================================================================
// Entity endpoints
// =============================================================================

/** GET /entities with sort, order=desc, limit, skip=0 */
export async function fetchEntities(
  sort: string,
  limit: number
): Promise<EntitiesResponse> {
  return api<EntitiesResponse>(
    "GET",
    `/entities?sort=${encodeURIComponent(sort)}&order=desc&limit=${limit}&skip=0`
  );
}

/** GET /entities/:id */
export async function fetchEntity(id: string): Promise<Entity> {
  return api<Entity>("GET", `/entities/${encodeURIComponent(id)}`);
}

/** GET /entities/cluster-map */
export async function fetchClusterMap(): Promise<ClusterMapResponse> {
  return api<ClusterMapResponse>("GET", "/entities/cluster-map");
}

// =============================================================================
// Health
// =============================================================================

/** GET /health */
export async function fetchHealth(): Promise<HealthResponse> {
  return api<HealthResponse>("GET", "/health");
}

// =============================================================================
// Admin endpoints
// =============================================================================

/** GET /admin/jobs */
export async function fetchJobs(): Promise<JobsResponse> {
  return api<JobsResponse>("GET", "/admin/jobs");
}

/** GET /admin/scan/status */
export async function fetchScanStatus(): Promise<{
  is_running: boolean;
  running_count: number;
  latest: Record<string, unknown> | null;
  recent_runs: Record<string, unknown>[];
  counts: Record<string, number>;
}> {
  return api("GET", "/admin/scan/status");
}

/** POST /admin/scan/run */
export async function triggerScan(): Promise<ScanRunResponse> {
  return api<ScanRunResponse>("POST", "/admin/scan/run");
}

/** POST /admin/re-enrich */
export async function triggerReEnrich(): Promise<ReEnrichResponse> {
  return api<ReEnrichResponse>("POST", "/admin/re-enrich");
}

// =============================================================================
// Reports
// =============================================================================

/** GET /reports */
export async function fetchReports(): Promise<Report[]> {
  return api<Report[]>("GET", "/reports");
}

// =============================================================================
// Chat (streaming)
// =============================================================================

/**
 * POST /chat — sends message and history, returns the raw Response for streaming.
 * Body: { message, history: [{ role, content }] }
 */
export function sendChatMessage(
  message: string,
  history: Array<{ role: string; content: string }>
): Promise<Response> {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
}
