import { API_URL, getAuthHeader } from './client';

export type TimelineEventType = 'daily_briefing' | 'earnings' | 'option_expiry';

export interface TimelineEvent {
  id: string;
  event_type: TimelineEventType;
  event_date: string;
  title: string;
  subtitle: string | null;
  metadata: Record<string, unknown>;
  briefing_report_id: string | null;
  created_at: string;
}

export interface TimelinePage {
  events: TimelineEvent[];
  next_cursor: string | null;
  has_more: boolean;
}

async function apiFetch<T>(path: string): Promise<T> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'API chyba');
  }
  return response.json();
}

export function fetchTimelinePage(limit = 30, cursor: string | null = null): Promise<TimelinePage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiFetch(`/api/timeline?${params.toString()}`);
}
