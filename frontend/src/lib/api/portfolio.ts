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
  total_invested_czk: number;
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
  gross_amount: number;
  gross_amount_czk: number;
  economic_amount: number;
  economic_amount_czk: number;
  net_cashflow: number;
  net_cashflow_czk: number;
  fee_czk: number;
  cost_basis_sold: number | null;
  cost_basis_sold_czk: number | null;
  realized_pnl: number | null;
  realized_pnl_czk: number | null;
  remaining_shares: number | null;
  remaining_cost_basis: number | null;
  remaining_cost_basis_czk: number | null;
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
  grossAmount: number;
  grossAmountCzk: number;
  economicAmount: number;
  economicAmountCzk: number;
  netCashflow: number;
  netCashflowCzk: number;
  feeCzk: number;
  costBasisSold: number | null;
  costBasisSoldCzk: number | null;
  realizedPnl: number | null;
  realizedPnlCzk: number | null;
  remainingShares: number | null;
  remainingCostBasis: number | null;
  remainingCostBasisCzk: number | null;
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
  exchangeRate?: number;
  economicBuyPrice: number;
  remainingCostBasis: number;
  remainingCostBasisCzk: number;
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

export interface RecalculateHoldingsResult {
  portfolios: number;
  recalculated: number;
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

export async function recalculateAllPortfolioHoldings(): Promise<RecalculateHoldingsResult> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/all/recalculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Nepodařilo se přepočítat portfolio účetnictví');
  }

  return response.json();
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
    total_invested_czk: requireHoldingTotalInvestedCzk(h.total_invested_czk),
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

function requireHoldingTotalInvestedCzk(
  totalInvestedCzk: number | undefined,
): number {
  if (totalInvestedCzk === undefined) {
    throw new Error('Backend neposlal total_invested_czk pro holding');
  }

  return totalInvestedCzk;
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
    total_invested_czk: requireHoldingTotalInvestedCzk(h.total_invested_czk),
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

  return raw.map((tx) => mapRawTransaction(tx));
}

interface AllTransactionsRaw extends TransactionRaw {
  portfolio_name: string;
}

export interface TransactionPage {
  data: Transaction[];
  next_cursor: string | null;
  has_more: boolean;
}

function mapSourceTransaction(tx: TransactionRaw['source_transaction']): SourceTransaction | undefined {
  if (!tx) {
    return undefined;
  }

  return {
    id: tx.id,
    date: tx.executed_at,
    price: tx.price_per_share,
    currency: tx.currency,
    shares: tx.shares,
  };
}

function mapRawTransaction(
  tx: TransactionRaw,
  options?: { portfolioName?: string },
): Transaction {
  return {
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
    grossAmount: tx.gross_amount,
    grossAmountCzk: tx.gross_amount_czk,
    economicAmount: tx.economic_amount,
    economicAmountCzk: tx.economic_amount_czk,
    netCashflow: tx.net_cashflow,
    netCashflowCzk: tx.net_cashflow_czk,
    feeCzk: tx.fee_czk,
    costBasisSold: tx.cost_basis_sold,
    costBasisSoldCzk: tx.cost_basis_sold_czk,
    realizedPnl: tx.realized_pnl,
    realizedPnlCzk: tx.realized_pnl_czk,
    remainingShares: tx.remaining_shares,
    remainingCostBasis: tx.remaining_cost_basis,
    remainingCostBasisCzk: tx.remaining_cost_basis_czk,
    date: tx.executed_at,
    notes: tx.notes,
    sourceTransactionId: tx.source_transaction_id,
    sourceTransaction: mapSourceTransaction(tx.source_transaction),
    portfolioName: options?.portfolioName,
  };
}

export async function fetchAllTransactions(limit: number = 1000): Promise<Transaction[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/all/transactions?limit=${limit}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Failed to fetch all transactions');
  }
  const body = await response.json();
  return (body.data as AllTransactionsRaw[]).map((tx) =>
    mapRawTransaction(tx, { portfolioName: tx.portfolio_name }),
  );
}

export async function fetchAllTransactionsPage(
  limit: number = 100,
  cursor?: string | null,
): Promise<TransactionPage> {
  const authHeader = await getAuthHeader();
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(
    `${API_URL}/api/portfolio/all/transactions?${params}`,
    { headers: { 'Content-Type': 'application/json', ...authHeader } },
  );
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Failed to fetch transactions');
  }
  const body = await response.json();
  return {
    data: (body.data as AllTransactionsRaw[]).map((tx) =>
      mapRawTransaction(tx, { portfolioName: tx.portfolio_name }),
    ),
    next_cursor: body.next_cursor ?? null,
    has_more: body.has_more ?? false,
  };
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
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Nelze upravit transakci');
    }
    throw new Error('Nepodařilo se upravit transakci');
  }
  
  const raw = await response.json();
  return mapRawTransaction(raw);
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


// ============ Performance Types ============

export interface PerformancePoint {
  date: string;
  value: number;
  invested: number;
  benchmark?: number | null;
}

export interface PerformanceResult {
  data: PerformancePoint[];
  total_return: number;
  total_return_pct: number;
  benchmark_return_pct?: number | null;
}

export type PerformancePeriod = '1W' | '1M' | '3M' | '6M' | 'MTD' | 'YTD' | '1Y' | 'ALL';


// ============ Performance Endpoints ============

export async function fetchStockPerformance(
  portfolioId?: string,
  period: PerformancePeriod = '1Y',
  customFrom?: string,
  customTo?: string
): Promise<PerformanceResult> {
  const authHeader = await getAuthHeader();
  const endpoint = portfolioId 
    ? `${API_URL}/api/portfolio/${portfolioId}/performance/stocks`
    : `${API_URL}/api/portfolio/all/performance/stocks`;
  
  const params = new URLSearchParams({ period });
  if (customFrom) params.append('from_date', customFrom);
  if (customTo) params.append('to_date', customTo);
  
  const response = await fetch(`${endpoint}?${params}`, {
    headers: {
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    throw new Error('Nepodařilo se načíst výkon portfolia');
  }
  
  return response.json();
}


export async function fetchOptionsPerformance(
  portfolioId?: string,
  period: PerformancePeriod = '1Y'
): Promise<PerformanceResult> {
  const authHeader = await getAuthHeader();
  const endpoint = portfolioId 
    ? `${API_URL}/api/portfolio/${portfolioId}/performance/options`
    : `${API_URL}/api/portfolio/all/performance/options`;
  
  const response = await fetch(`${endpoint}?period=${period}`, {
    headers: {
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    throw new Error('Nepodařilo se načíst výkon opcí');
  }
  
  return response.json();
}
