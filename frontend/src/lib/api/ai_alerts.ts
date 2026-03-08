/**
 * AI Alert Suggestions API — generate technical price alert suggestions
 */
import { API_URL, getAuthHeader } from './client';
import type { AlertConditionType } from './alerts';

export interface AlertSuggestion {
  ticker: string;
  condition_type: AlertConditionType;
  price: number;
  reason: string;
}

export interface AlertSuggestionsResponse {
  suggestions: AlertSuggestion[];
  cached: boolean;
}

export async function generateAlertSuggestions(
  tickers?: string[],
  watchlistId?: string,
): Promise<AlertSuggestionsResponse> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/ai/alert-suggestions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      tickers: tickers ?? [],
      watchlist_id: watchlistId ?? null,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}
