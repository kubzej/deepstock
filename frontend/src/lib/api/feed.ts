/**
 * Feed API — feed lists CRUD + AI summary generation
 */
import { API_URL, getAuthHeader } from './client';

export interface FeedList {
  id: string;
  name: string;
  description: string | null;
  source: string;
  created_at: string;
  feed_list_accounts: { username: string }[];
}

export interface FeedSummaryResponse {
  markdown: string;
  cached: boolean;
  generated_at: string;
  model_used: string;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const authHeader = await getAuthHeader();
  const resp = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader },
    ...options,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || 'API chyba');
  }
  if (resp.status === 204) return null;
  return resp.json();
}

export const fetchFeedLists = (): Promise<FeedList[]> =>
  apiFetch('/api/feed/lists');

export const createFeedList = (name: string, description?: string): Promise<FeedList> =>
  apiFetch('/api/feed/lists', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });

export const updateFeedList = (id: string, name: string, description?: string): Promise<FeedList> =>
  apiFetch(`/api/feed/lists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, description }),
  });

export const deleteFeedList = (id: string): Promise<null> =>
  apiFetch(`/api/feed/lists/${id}`, { method: 'DELETE' });

export const addFeedAccount = (listId: string, username: string) =>
  apiFetch(`/api/feed/lists/${listId}/accounts`, {
    method: 'POST',
    body: JSON.stringify({ username }),
  });

export const removeFeedAccount = (listId: string, username: string): Promise<null> =>
  apiFetch(`/api/feed/lists/${listId}/accounts/${encodeURIComponent(username)}`, {
    method: 'DELETE',
  });

export const getCachedFeedSummary = (listId: string): Promise<FeedSummaryResponse> =>
  apiFetch(`/api/feed/lists/${listId}/summary`);

export const generateFeedSummary = (listId: string, force = false): Promise<FeedSummaryResponse> =>
  apiFetch(`/api/feed/lists/${listId}/summary${force ? '?force=true' : ''}`, { method: 'POST' });
