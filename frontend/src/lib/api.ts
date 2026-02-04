import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Get authorization header with current session token
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

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

// ============ Portfolio Types ============

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avg_cost: number;
  currency: string;
  current_price?: number;
  current_value?: number;
  unrealized_pnl?: number;
  unrealized_pnl_pct?: number;
}

export interface Transaction {
  id: string;
  portfolio_id: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price: number;
  total: number;
  currency: string;
  date: string;
  notes?: string;
}

// ============ Market Endpoints ============

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

// Price history for charts
export interface PriceHistoryPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartPeriod = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max';

export async function fetchPriceHistory(
  ticker: string,
  period: ChartPeriod = '1mo'
): Promise<PriceHistoryPoint[]> {
  const response = await fetch(
    `${API_URL}/api/market/history/${encodeURIComponent(ticker)}?period=${period}`
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch price history');
  }
  
  return response.json();
}

// ============ Portfolio Endpoints ============

export async function fetchPortfolios(): Promise<Portfolio[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch portfolios');
  }
  
  return response.json();
}

export async function createPortfolio(name: string): Promise<Portfolio> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ name }),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to create portfolio');
  }
  
  return response.json();
}

export async function fetchHoldings(portfolioId: string): Promise<Holding[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/holdings`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch holdings');
  }
  
  // Transform backend response (nested stocks) to flat Holding interface
  const data = await response.json();
  return data.map((h: { stocks: { ticker: string; name: string; currency: string }; shares: number; avg_cost_per_share: number }) => ({
    ticker: h.stocks.ticker,
    name: h.stocks.name,
    shares: h.shares,
    avg_cost: h.avg_cost_per_share,
    currency: h.stocks.currency || 'USD',
  }));
}

export async function fetchTransactions(portfolioId: string, limit: number = 50): Promise<Transaction[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/transactions?limit=${limit}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch transactions');
  }
  
  return response.json();
}

export async function addTransaction(
  portfolioId: string, 
  data: Omit<Transaction, 'id' | 'portfolio_id'>
): Promise<Transaction> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to add transaction');
  }
  
  return response.json();
}

export async function updatePortfolio(
  portfolioId: string,
  data: { name?: string; description?: string }
): Promise<Portfolio> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    if (response.status === 404) {
      throw new Error('Portfolio not found');
    }
    throw new Error('Failed to update portfolio');
  }
  
  return response.json();
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    if (response.status === 404) {
      throw new Error('Portfolio not found');
    }
    throw new Error('Failed to delete portfolio');
  }
}

// ============ Stocks Types ============

export interface Stock {
  id: string;
  ticker: string;
  name: string;
  currency: string;
  sector?: string;
  exchange?: string;
  country?: string;
  price_scale?: number;
  notes?: string;
  created_at: string;
}

// ============ Stocks Endpoints ============

export async function fetchStocks(limit: number = 100, offset: number = 0): Promise<Stock[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/?limit=${limit}&offset=${offset}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch stocks');
  }
  
  return response.json();
}

export async function searchStocks(query: string, limit: number = 20): Promise<Stock[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to search stocks');
  }
  
  return response.json();
}

export async function fetchStock(ticker: string): Promise<Stock> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/${encodeURIComponent(ticker)}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    if (response.status === 404) {
      throw new Error('Stock not found');
    }
    throw new Error('Failed to fetch stock');
  }
  
  return response.json();
}

export async function createStock(data: {
  ticker: string;
  name: string;
  currency?: string;
  sector?: string;
  exchange?: string;
  country?: string;
  price_scale?: number;
  notes?: string;
}): Promise<Stock> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create stock');
    }
    throw new Error('Failed to create stock');
  }
  
  return response.json();
}

export async function updateStock(
  stockId: string,
  data: { name?: string; currency?: string; sector?: string; exchange?: string; country?: string; price_scale?: number; notes?: string }
): Promise<Stock> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/${stockId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    if (response.status === 404) {
      throw new Error('Stock not found');
    }
    throw new Error('Failed to update stock');
  }
  
  return response.json();
}

export async function deleteStock(stockId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/${stockId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Cannot delete stock with transactions');
    }
    throw new Error('Failed to delete stock');
  }
}
