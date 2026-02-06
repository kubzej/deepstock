/**
 * Portfolio API - Portfolio CRUD, holdings, transactions, open lots
 */
import { API_URL, getAuthHeader } from './client';

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
  sector?: string;
  price_scale?: number;
  total_invested_czk?: number;
  current_price?: number;
  current_value?: number;
  unrealized_pnl?: number;
  unrealized_pnl_pct?: number;
  // For "All portfolios" view
  portfolio_id?: string;
  portfolio_name?: string;
}

// Raw transaction from API
interface TransactionRaw {
  id: string;
  portfolio_id: string;
  stock_id: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price_per_share: number;
  total_amount: number;
  total_amount_czk: number;
  currency: string;
  exchange_rate_to_czk?: number;
  fees?: number;
  executed_at: string;
  notes?: string;
  source_transaction_id?: string;
  stocks: {
    ticker: string;
    name: string;
  };
  // Source transaction for SELL (joined from backend)
  source_transaction?: {
    id: string;
    executed_at: string;
    price_per_share: number;
    currency: string;
    shares: number;
  };
}

// Source lot info for SELL transactions
export interface SourceTransaction {
  id: string;
  date: string;
  price: number;
  currency: string;
  shares: number;
}

// Transformed transaction for frontend
export interface Transaction {
  id: string;
  portfolioId: string;
  ticker: string;
  stockName: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price: number;
  total: number;
  totalCzk: number;
  currency: string;
  exchangeRate?: number;
  fees?: number;
  date: string;
  notes?: string;
  // For SELL: source lot transaction ID and full object
  sourceTransactionId?: string;
  sourceTransaction?: SourceTransaction;
  // For "All portfolios" view
  portfolioName?: string;
}

export interface OpenLot {
  id: string;
  ticker: string;
  stockName: string;
  date: string;
  shares: number;
  buyPrice: number;
  currency: string;
  priceScale?: number;
  portfolioName?: string;
}

export interface TransactionUpdateData {
  shares?: number;
  price_per_share?: number;
  currency?: string;
  exchange_rate_to_czk?: number;
  fees?: number;
  notes?: string;
  executed_at?: string;
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

// ============ Holdings Endpoints ============

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
  return data.map((h: { stocks: { ticker: string; name: string; currency: string; sector?: string; price_scale?: string | number }; shares: number; avg_cost_per_share: number; total_invested_czk?: number }) => ({
    ticker: h.stocks.ticker,
    name: h.stocks.name,
    shares: h.shares,
    avg_cost: h.avg_cost_per_share,
    currency: h.stocks.currency || 'USD',
    sector: h.stocks.sector || '',
    price_scale: parseFloat(String(h.stocks.price_scale)) || 1,
    total_invested_czk: h.total_invested_czk,
  }));
}

interface AllHoldingsRaw {
  stocks: { 
    ticker: string; 
    name: string; 
    currency: string; 
    sector?: string; 
    price_scale?: string | number;
  };
  shares: number;
  avg_cost_per_share: number;
  total_invested_czk?: number;
  portfolio_id: string;
  portfolio_name: string;
}

export async function fetchAllHoldings(): Promise<Holding[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/all/holdings`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch all holdings');
  }
  
  const data: AllHoldingsRaw[] = await response.json();
  return data.map((h) => ({
    ticker: h.stocks.ticker,
    name: h.stocks.name,
    shares: h.shares,
    avg_cost: h.avg_cost_per_share,
    currency: h.stocks.currency || 'USD',
    sector: h.stocks.sector || '',
    price_scale: parseFloat(String(h.stocks.price_scale)) || 1,
    total_invested_czk: h.total_invested_czk,
    portfolio_id: h.portfolio_id,
    portfolio_name: h.portfolio_name,
  }));
}

// ============ Open Lots Endpoints ============

export async function fetchOpenLots(portfolioId: string): Promise<OpenLot[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/open-lots`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch open lots');
  }
  
  return response.json();
}

export async function fetchAllOpenLots(): Promise<OpenLot[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/all/open-lots`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch all open lots');
  }
  
  return response.json();
}

// ============ Transaction Endpoints ============

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
  
  const raw: TransactionRaw[] = await response.json();
  
  // Transform to frontend format
  return raw.map((tx) => ({
    id: tx.id,
    portfolioId: tx.portfolio_id,
    ticker: tx.stocks?.ticker || 'UNKNOWN',
    stockName: tx.stocks?.name || '',
    type: tx.type,
    shares: tx.shares,
    price: tx.price_per_share,
    total: tx.total_amount,
    totalCzk: tx.total_amount_czk || 0,
    currency: tx.currency,
    exchangeRate: tx.exchange_rate_to_czk,
    fees: tx.fees,
    date: tx.executed_at,
    notes: tx.notes,
    sourceTransactionId: tx.source_transaction_id,
    sourceTransaction: tx.source_transaction ? {
      id: tx.source_transaction.id,
      date: tx.source_transaction.executed_at,
      price: tx.source_transaction.price_per_share,
      currency: tx.source_transaction.currency,
      shares: tx.source_transaction.shares,
    } : undefined,
  }));
}

interface AllTransactionsRaw extends TransactionRaw {
  portfolio_name: string;
}

export async function fetchAllTransactions(limit: number = 100): Promise<Transaction[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/all/transactions?limit=${limit}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch all transactions');
  }
  
  const raw: AllTransactionsRaw[] = await response.json();
  
  return raw.map((tx) => ({
    id: tx.id,
    portfolioId: tx.portfolio_id,
    ticker: tx.stocks?.ticker || 'UNKNOWN',
    stockName: tx.stocks?.name || '',
    type: tx.type,
    shares: tx.shares,
    price: tx.price_per_share,
    total: tx.total_amount,
    totalCzk: tx.total_amount_czk || 0,
    currency: tx.currency,
    exchangeRate: tx.exchange_rate_to_czk,
    fees: tx.fees,
    date: tx.executed_at,
    notes: tx.notes,
    sourceTransactionId: tx.source_transaction_id,
    sourceTransaction: tx.source_transaction ? {
      id: tx.source_transaction.id,
      date: tx.source_transaction.executed_at,
      price: tx.source_transaction.price_per_share,
      currency: tx.source_transaction.currency,
      shares: tx.source_transaction.shares,
    } : undefined,
    portfolioName: tx.portfolio_name,
  }));
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

export async function updateTransaction(
  portfolioId: string,
  transactionId: string,
  data: TransactionUpdateData
): Promise<Transaction> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/transactions/${transactionId}`, {
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
      throw new Error('Transakce nenalezena');
    }
    throw new Error('Nepodařilo se upravit transakci');
  }
  
  const raw = await response.json();
  return {
    id: raw.id,
    portfolioId: raw.portfolio_id,
    ticker: raw.stocks?.ticker || '',
    stockName: raw.stocks?.name || '',
    type: raw.type,
    shares: raw.shares,
    price: raw.price_per_share,
    total: raw.total_amount,
    totalCzk: raw.total_amount * (raw.exchange_rate_to_czk || 1),
    currency: raw.currency,
    exchangeRate: raw.exchange_rate_to_czk,
    fees: raw.fees,
    date: raw.executed_at,
    notes: raw.notes,
  };
}

export async function deleteTransaction(
  portfolioId: string,
  transactionId: string
): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/transactions/${transactionId}`, {
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
      throw new Error('Transakce nenalezena');
    }
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Nelze smazat transakci');
    }
    throw new Error('Nepodařilo se smazat transakci');
  }
}
