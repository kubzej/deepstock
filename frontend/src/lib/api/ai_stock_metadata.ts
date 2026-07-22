import { API_URL, getAuthHeader } from './client';

export interface StockMetadataSuggestion {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  currency: string | null;
  country: string | null;
  price_scale: number | null;
  notes: string | null;
  cached: boolean;
  used_ai: boolean;
}

export async function generateStockMetadata(
  ticker: string,
): Promise<StockMetadataSuggestion> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/ai/stock-metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ ticker }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error(
      error?.detail || 'Nepodařilo se AI doplnění metadat akcie.',
    );
  }

  return response.json();
}
