/**
 * Insider Trading API — SEC Form 4 data
 */
import { API_URL } from './client';

export interface InsiderTrade {
  ticker: string;
  filing_date: string;
  trade_date: string;
  insider_name: string;
  insider_title: string | null;
  trade_type: 'Purchase' | 'Sale' | 'Option Exercise' | 'Gift' | 'Other';
  shares: number;
  price_per_share: number | null;
  total_value: number | null;
  shares_owned_after: number | null;
  filing_url: string;
}

export interface InsiderTradesResponse {
  ticker: string;
  trades: InsiderTrade[];
  source: string;
}

export async function fetchInsiderTrades(
  ticker: string,
  months = 12,
): Promise<InsiderTradesResponse> {
  const response = await fetch(
    `${API_URL}/api/insider/${encodeURIComponent(ticker.toUpperCase())}?months=${months}`,
  );

  if (!response.ok) {
    throw new Error('Failed to fetch insider trades');
  }

  return response.json();
}
