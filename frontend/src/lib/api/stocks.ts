/**
 * Stocks API - Stocks CRUD operations
 */
import { API_URL, getAuthHeader } from './client';

// ============ Stock Types ============

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

// ============ Stock Endpoints ============

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
