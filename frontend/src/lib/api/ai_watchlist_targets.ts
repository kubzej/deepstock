/**
 * AI Watchlist Targets API — suggest buy/sell price targets for a watchlist item
 */
import { API_URL, getAuthHeader } from './client';

export interface WatchlistTargetsRequest {
  ticker: string;
  avg_cost?: number;   // User's average purchase price (if holding)
  shares?: number;     // Number of shares held
}

export interface WatchlistTargetsResponse {
  ticker: string;
  buy_target: number | null;
  sell_target: number | null;
  comment: string;
  cached: boolean;
}

export async function generateWatchlistTargets(
  request: WatchlistTargetsRequest,
): Promise<WatchlistTargetsResponse> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/ai/watchlist-targets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}
