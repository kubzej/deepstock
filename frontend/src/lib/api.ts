const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  lastUpdated: string;
}

export interface ExchangeRates {
  [key: string]: number;  // e.g., USD: 24.5 (means 1 USD = 24.5 CZK)
}

// Fallback rates if API fails (approximate values)
export const DEFAULT_RATES: ExchangeRates = {
  USD: 23.5,
  EUR: 25.5,
  GBP: 30.0,
  CHF: 27.0,
};

export async function fetchQuotes(tickers: string[]): Promise<Record<string, Quote>> {
  const response = await fetch(`${API_URL}/api/market/batch-quotes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tickers }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch quotes');
  }
  
  return response.json();
}

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  const response = await fetch(`${API_URL}/api/market/exchange-rates`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch exchange rates');
  }
  
  return response.json();
}
