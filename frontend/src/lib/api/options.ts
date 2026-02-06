/**
 * Options API - Options trading endpoints
 */
import { API_URL, getAuthHeader } from './client';

// ============ Options Types ============

export type OptionType = 'call' | 'put';
export type OptionAction = 'BTO' | 'STC' | 'STO' | 'BTC' | 'EXPIRATION' | 'ASSIGNMENT' | 'EXERCISE';
export type OptionPosition = 'long' | 'short';
export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export interface OptionTransaction {
  id: string;
  portfolio_id: string;
  portfolio_name?: string;
  symbol: string;
  option_symbol: string;
  option_type: OptionType;
  strike_price: number;
  expiration_date: string;
  action: OptionAction;
  contracts: number;
  premium: number | null;
  total_premium: number | null;
  currency: string;
  exchange_rate_to_czk: number | null;
  fees: number;
  date: string;
  notes: string | null;
  linked_stock_tx_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OptionHolding {
  portfolio_id: string;
  symbol: string;
  option_symbol: string;
  option_type: OptionType;
  strike_price: number;
  expiration_date: string;
  position: OptionPosition;
  contracts: number;
  avg_premium: number | null;
  total_cost: number;
  total_fees: number;
  first_transaction: string | null;
  last_transaction: string | null;
  dte: number;
  // From option_prices cache
  current_price: number | null;
  bid: number | null;
  ask: number | null;
  implied_volatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  price_updated_at: string | null;
  // Underlying price
  underlying_price: number | null;
  underlying_price_updated_at: string | null;
  underlying_price_source: 'portfolio' | 'watchlist' | null;
  moneyness: Moneyness | null;
  buffer_percent: number | null;
}

export interface OptionStats {
  total_positions: number;
  long_positions: number;
  short_positions: number;
  expiring_this_week: number;
  calls: number;
  puts: number;
  total_cost: number;
  itm_count: number;
  otm_count: number;
}

export interface CreateOptionTransactionInput {
  symbol: string;
  option_type: OptionType;
  strike_price: number;
  expiration_date: string;
  action: OptionAction;
  contracts: number;
  premium?: number;
  currency?: string;
  exchange_rate_to_czk?: number;
  fees?: number;
  date: string;
  notes?: string;
}

export interface UpdateOptionTransactionInput {
  action?: OptionAction;
  contracts?: number;
  premium?: number;
  currency?: string;
  exchange_rate_to_czk?: number;
  fees?: number;
  date?: string;
  notes?: string;
}

// ============ Options Endpoints ============

export async function fetchOptionHoldings(portfolioId?: string): Promise<OptionHolding[]> {
  const authHeader = await getAuthHeader();
  const url = portfolioId 
    ? `${API_URL}/api/options/holdings/${portfolioId}`
    : `${API_URL}/api/options/holdings`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst opční pozice');
  }
  
  return response.json();
}

export async function fetchOptionTransactions(
  portfolioId?: string,
  symbol?: string,
  optionSymbol?: string,
  limit: number = 100
): Promise<OptionTransaction[]> {
  const authHeader = await getAuthHeader();
  const params = new URLSearchParams();
  if (portfolioId) params.append('portfolio_id', portfolioId);
  if (symbol) params.append('symbol', symbol);
  if (optionSymbol) params.append('option_symbol', optionSymbol);
  params.append('limit', limit.toString());
  
  const response = await fetch(`${API_URL}/api/options/transactions?${params}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Nepodařilo se načíst opční transakce');
  }
  
  return response.json();
}

export async function fetchOptionStats(portfolioId?: string): Promise<OptionStats> {
  const authHeader = await getAuthHeader();
  const params = portfolioId ? `?portfolio_id=${portfolioId}` : '';
  
  const response = await fetch(`${API_URL}/api/options/stats${params}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst statistiky');
  }
  
  return response.json();
}

export async function createOptionTransaction(
  portfolioId: string,
  data: CreateOptionTransactionInput
): Promise<OptionTransaction> {
  const authHeader = await getAuthHeader();
  
  const response = await fetch(`${API_URL}/api/options/transactions/${portfolioId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se vytvořit transakci');
  }
  
  return response.json();
}

export async function updateOptionTransaction(
  transactionId: string,
  data: UpdateOptionTransactionInput
): Promise<OptionTransaction> {
  const authHeader = await getAuthHeader();
  
  const response = await fetch(`${API_URL}/api/options/transactions/${transactionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Transakce nenalezena');
    throw new Error('Nepodařilo se upravit transakci');
  }
  
  return response.json();
}

export async function deleteOptionTransaction(transactionId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  
  const response = await fetch(`${API_URL}/api/options/transactions/${transactionId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Transakce nenalezena');
    throw new Error('Nepodařilo se smazat transakci');
  }
}

export async function deleteOptionTransactionsBySymbol(
  portfolioId: string,
  optionSymbol: string
): Promise<void> {
  const authHeader = await getAuthHeader();
  
  const response = await fetch(
    `${API_URL}/api/options/transactions/by-symbol/${encodeURIComponent(optionSymbol)}?portfolio_id=${portfolioId}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
    }
  );
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Pozice nenalezena');
    throw new Error('Nepodařilo se smazat pozici');
  }
}

export async function closeOptionPosition(
  portfolioId: string,
  optionSymbol: string,
  closingAction: OptionAction,
  contracts: number,
  closeDate: string,
  premium?: number,
  fees?: number,
  exchangeRateToCzk?: number,
  notes?: string
): Promise<OptionTransaction> {
  const authHeader = await getAuthHeader();
  
  const params = new URLSearchParams({
    option_symbol: optionSymbol,
    closing_action: closingAction,
    contracts: contracts.toString(),
    close_date: closeDate,
  });
  
  if (premium !== undefined) params.append('premium', premium.toString());
  if (fees !== undefined) params.append('fees', fees.toString());
  if (exchangeRateToCzk !== undefined) params.append('exchange_rate_to_czk', exchangeRateToCzk.toString());
  if (notes) params.append('notes', notes);
  
  const response = await fetch(`${API_URL}/api/options/${portfolioId}/close?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Neplatný požadavek');
    }
    throw new Error('Nepodařilo se uzavřít pozici');
  }
  
  return response.json();
}
