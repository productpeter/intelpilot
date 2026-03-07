import type { Entity } from '@/types';

const PRICING_RE = /^\$?\d[\d,.]*\s*\/\s*(?:mo|month|year|yr|user|seat)/i;
const BARE_PRICE_RE = /^\$?\d{1,3}(?:\.\d{2})?\s*$/;

export function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtFull(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 30);
  }
}

export function shortNum(n: number): string {
  if (n >= 1e12) return `${+(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(0)}K`;
  return String(n);
}

export function isPricing(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const v = val.trim();
  if (PRICING_RE.test(v)) return true;
  if (BARE_PRICE_RE.test(v)) return true;
  return false;
}

export function metricStr(val: unknown): string | null {
  if (!val) return null;
  if (
    typeof val === 'string' &&
    (val === 'null' ||
      val === 'N/A' ||
      val === 'n/a' ||
      val === 'unknown' ||
      val === 'none' ||
      val === 'None')
  )
    return null;
  if (typeof val === 'number') return shortNum(val);
  if (typeof val === 'string') {
    return val.replace(
      /(?<!\.)(\d{7,})(?!\.\d)/g,
      (_, digits: string) => shortNum(parseInt(digits, 10))
    );
  }
  if (typeof val === 'object') {
    const obj = val as { total?: unknown };
    const raw = obj.total != null ? obj.total : JSON.stringify(val).slice(0, 60);
    return metricStr(raw);
  }
  return String(val);
}

function isGeneric(n: string): boolean {
  return /^(AI |An AI |The )/i.test(n) || n.length > 30;
}

export function bestName(e: Entity): string {
  const clean = e.classification?.clean_name ?? '';
  const raw = e.name ?? '';
  const researched = e.enrichment?.metrics?.matched_name ?? '';
  if (clean && !isGeneric(clean)) return clean;
  if (researched && !isGeneric(researched)) return researched;
  if (raw && !isGeneric(raw)) return raw;
  return researched || clean || raw || 'Unknown';
}

export function hasRevenue(e: Entity): boolean {
  const rev = e.enrichment?.metrics?.revenue;
  return !!(rev && !isPricing(rev));
}

export function hasFunding(e: Entity): boolean {
  return !!(e.enrichment?.metrics?.funding);
}

export function hasAnyMetric(e: Entity): boolean {
  const m = e.enrichment?.metrics;
  return !!(m && (m.revenue || m.funding || m.user_count || m.team_size));
}

export function escHtml(str: string | null | undefined): string {
  return str ?? '';
}
