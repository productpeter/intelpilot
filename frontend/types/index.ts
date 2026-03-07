// =============================================================================
// Entity types (GET /api/entities)
// =============================================================================

export interface EntityClassification {
  is_startup: boolean;
  clean_name: string;
  category: string;
  one_liner: string;
  confidence: number;
}

export interface EntityEnrichmentMetrics {
  revenue?: string | null;
  revenue_source?: string | null;
  funding?: string | null;
  funding_source?: string | null;
  team_size?: string | null;
  team_size_source?: string | null;
  user_count?: string | null;
  user_count_source?: string | null;
  growth?: string | null;
  growth_source?: string | null;
  monthly_traffic?: string | null;
  monthly_traffic_source?: string | null;
  tech_stack?: string | null;
  tech_stack_source?: string | null;
  founded_year?: string | null;
  notable?: string | null;
  notable_source?: string | null;
  description?: string | null;
  website?: string | null;
  matched_name?: string | null;
}

export interface EntityRecentNews {
  title: string;
  url: string;
  date: string;
  summary: string;
}

export interface EntityEnrichment {
  metrics: EntityEnrichmentMetrics;
  web_verified: boolean;
  enriched_at: string;
  recent_news: EntityRecentNews[];
}

export interface EntitySignal {
  signal_type: string;
  value_text: string;
  enriched: boolean;
  evidence_id: string;
}

export interface EntityEvidence {
  _id: string;
  url: string;
  type: string;
  snippet: string;
}

export interface EntityDiscoveryMeta {
  subreddit?: string;
  feed_label?: string;
  upvotes?: number;
  snippet?: string;
}

export interface EntityDiscovery {
  candidate_url: string;
  title: string;
  discovered_at: string;
  status: string;
  meta: EntityDiscoveryMeta;
}

export interface Entity {
  _id: string;
  name: string;
  description: string;
  website_url: string;
  canonical_domain: string;
  created_at: string;
  updated_at: string;
  classification: EntityClassification;
  enrichment: EntityEnrichment;
  signals: EntitySignal[];
  evidence: EntityEvidence[];
  discoveries: EntityDiscovery[];
}

// =============================================================================
// Cluster map types (GET /api/entities/cluster-map)
// =============================================================================

export interface ClusterNode {
  _id: string;
  x: number;
  y: number;
  name: string;
  category: string;
  revenue: string | null;
  funding: string | null;
  traffic: string | null;
  tech_stack: string | null;
}

// =============================================================================
// Admin jobs types (GET /api/admin/jobs)
// =============================================================================

export type JobStatus = 'running' | 'done' | 'error';

export interface JobInfo {
  status: JobStatus;
  completed: number;
  failed: number;
  total: number;
  message: string | object;
}

export type JobsResponse = Record<string, JobInfo>;

// =============================================================================
// Report types (GET /api/reports)
// =============================================================================

export interface ReportStats {
  entities_in_report: number;
  total_entities_updated: number;
}

export interface Report {
  _id: string;
  generated_at: string;
  stats: ReportStats;
}

// =============================================================================
// Chat types
// =============================================================================

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}
