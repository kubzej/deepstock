import { API_URL, getAuthHeader } from './client';

export type DailyBriefingPriority = 'high' | 'medium' | 'low';
export type DailyBriefingScopeSourceType = 'portfolio' | 'watchlist';
export type DailyNewsReportStatus = 'running' | 'succeeded' | 'degraded' | 'failed';
export type DailyNewsTriggerType = 'scheduled' | 'manual';
export type DailyNewsImportance = 'high' | 'medium' | 'low' | 'noise';

export interface DailyBriefingSettings {
  user_id: string;
  enabled: boolean;
  include_market_context: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DailyBriefingScopeItem {
  id?: string;
  user_id?: string;
  source_type: DailyBriefingScopeSourceType;
  source_id: string;
  enabled: boolean;
  priority: DailyBriefingPriority;
  source_name?: string | null;
  item_count?: number | null;
}

export interface DailyBriefingScopeOption {
  id: string;
  source_type: DailyBriefingScopeSourceType;
  name: string;
  description?: string | null;
  item_count: number;
}

export interface DailyBriefingScopeOptions {
  portfolios: DailyBriefingScopeOption[];
  watchlists: DailyBriefingScopeOption[];
  selected_items: DailyBriefingScopeItem[];
}

export interface DailyNewsReport {
  id: string;
  user_id: string;
  status: DailyNewsReportStatus;
  trigger_type: DailyNewsTriggerType;
  window_start: string;
  window_end: string;
  started_at?: string | null;
  completed_at?: string | null;
  title?: string | null;
  summary?: string | null;
  markdown?: string | null;
  model_used?: string | null;
  scope_snapshot: Record<string, unknown>;
  source_counts: Record<string, unknown>;
  warnings: unknown[];
  error?: string | null;
  notification_status?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DailyNewsReportList {
  reports: DailyNewsReport[];
  limit: number;
  offset: number;
}

export interface DailyNewsSourceItem {
  id: string;
  report_id: string;
  ticker?: string | null;
  scope_type: 'holding' | 'watchlist' | 'market' | 'macro' | 'sector';
  scope_priority?: DailyBriefingPriority | null;
  source_type: 'marketaux' | 'edgar' | 'deepstock_market';
  title: string;
  snippet?: string | null;
  url?: string | null;
  source_name?: string | null;
  published_at?: string | null;
  relevance_score?: number | null;
  importance: DailyNewsImportance;
  used_in_prompt: boolean;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeader = await getAuthHeader();
  const resp = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader },
    ...options,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(formatApiError(err.detail));
  }
  return resp.json();
}

function formatApiError(detail: unknown) {
  if (!detail) return 'API chyba';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String(item.msg);
        }
        return JSON.stringify(item);
      })
      .join(', ');
  }
  if (typeof detail === 'object' && 'msg' in detail) {
    return String(detail.msg);
  }
  return JSON.stringify(detail);
}

export const fetchDailyBriefingSettings = (): Promise<DailyBriefingSettings> =>
  apiFetch('/api/daily-briefing/settings');

export const updateDailyBriefingSettings = (
  settings: Pick<DailyBriefingSettings, 'enabled' | 'include_market_context'>,
): Promise<DailyBriefingSettings> =>
  apiFetch('/api/daily-briefing/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

export const fetchDailyBriefingScopeOptions = (): Promise<DailyBriefingScopeOptions> =>
  apiFetch('/api/daily-briefing/scope-options');

export const updateDailyBriefingScope = (
  items: DailyBriefingScopeItem[],
): Promise<DailyBriefingScopeOptions> =>
  apiFetch('/api/daily-briefing/scope', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });

export const fetchDailyBriefingReports = (
  limit = 20,
  offset = 0,
): Promise<DailyNewsReportList> =>
  apiFetch(`/api/daily-briefing/reports?limit=${limit}&offset=${offset}`);

export const fetchDailyBriefingReport = (reportId: string): Promise<DailyNewsReport> =>
  apiFetch(`/api/daily-briefing/reports/${reportId}`);

export const fetchDailyBriefingSources = (
  reportId: string,
): Promise<{ sources: DailyNewsSourceItem[] }> =>
  apiFetch(`/api/daily-briefing/reports/${reportId}/sources`);

export const generateDailyBriefing = (
  force = false,
): Promise<{ report_id: string; status: DailyNewsReportStatus }> =>
  apiFetch(`/api/daily-briefing/generate${force ? '?force=true' : ''}`, {
    method: 'POST',
  });
