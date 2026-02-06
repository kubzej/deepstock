/**
 * Watchlists API - Watchlists, items, and tags
 */
import { API_URL, getAuthHeader } from './client';

// ============ Watchlist Types ============

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
  item_count?: number;
}

export interface WatchlistItem {
  id: string;
  watchlist_id: string;
  stock_id: string;
  target_buy_price: number | null;
  target_sell_price: number | null;
  notes: string | null;
  sector: string | null;
  added_at: string;
  updated_at: string | null;
  stocks: {
    id: string;
    ticker: string;
    name: string;
    currency: string;
    sector: string | null;
    price_scale: number;
  };
  tags?: WatchlistTag[];
}

export interface WatchlistTag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

// ============ Watchlist Endpoints ============

export async function fetchWatchlists(): Promise<Watchlist[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst watchlisty');
  }
  
  return response.json();
}

/**
 * Fetch all unique tickers from all user's watchlists.
 * Used for prefetching quotes on app load.
 */
export async function fetchAllWatchlistTickers(): Promise<string[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/tickers`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) return []; // Silent fail for prefetch
    return [];
  }
  
  return response.json();
}

export async function fetchWatchlist(watchlistId: string): Promise<Watchlist> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Watchlist nenalezen');
    throw new Error('Nepodařilo se načíst watchlist');
  }
  
  return response.json();
}

export async function createWatchlist(data: {
  name: string;
  description?: string;
}): Promise<Watchlist> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se vytvořit watchlist');
  }
  
  return response.json();
}

export async function updateWatchlist(
  watchlistId: string,
  data: { name?: string; description?: string | null }
): Promise<Watchlist> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Watchlist nenalezen');
    throw new Error('Nepodařilo se upravit watchlist');
  }
  
  return response.json();
}

export async function deleteWatchlist(watchlistId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Watchlist nenalezen');
    throw new Error('Nepodařilo se smazat watchlist');
  }
}

export async function reorderWatchlists(watchlistIds: string[]): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/reorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ watchlist_ids: watchlistIds }),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se změnit pořadí');
  }
}

// ============ Watchlist Items Endpoints ============

export async function fetchWatchlistItems(watchlistId: string): Promise<WatchlistItem[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}/items`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst položky');
  }
  
  return response.json();
}

export async function addWatchlistItem(
  watchlistId: string,
  data: {
    ticker: string;
    stock_name?: string;
    target_buy_price?: number;
    target_sell_price?: number;
    notes?: string;
    sector?: string;
  }
): Promise<WatchlistItem> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Nepodařilo se přidat položku');
    }
    throw new Error('Nepodařilo se přidat položku');
  }
  
  return response.json();
}

export async function updateWatchlistItem(
  itemId: string,
  data: {
    target_buy_price?: number | null;
    target_sell_price?: number | null;
    notes?: string | null;
    sector?: string | null;
  }
): Promise<WatchlistItem> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/items/${itemId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Položka nenalezena');
    throw new Error('Nepodařilo se upravit položku');
  }
  
  return response.json();
}

export async function deleteWatchlistItem(itemId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/items/${itemId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Položka nenalezena');
    throw new Error('Nepodařilo se smazat položku');
  }
}

export async function moveWatchlistItem(
  itemId: string,
  targetWatchlistId: string
): Promise<WatchlistItem> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/items/${itemId}/move`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ target_watchlist_id: targetWatchlistId }),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Nepodařilo se přesunout položku');
    }
    throw new Error('Nepodařilo se přesunout položku');
  }
  
  return response.json();
}

// ============ Watchlist Tags Endpoints ============

export async function fetchWatchlistTags(): Promise<WatchlistTag[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/tags/all`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst tagy');
  }
  
  return response.json();
}

export async function createWatchlistTag(data: {
  name: string;
  color?: string;
}): Promise<WatchlistTag> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/tags`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Nepodařilo se vytvořit tag');
    }
    throw new Error('Nepodařilo se vytvořit tag');
  }
  
  return response.json();
}

export async function updateWatchlistTag(
  tagId: string,
  data: { name?: string; color?: string }
): Promise<WatchlistTag> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/tags/${tagId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Tag nenalezen');
    throw new Error('Nepodařilo se upravit tag');
  }
  
  return response.json();
}

export async function deleteWatchlistTag(tagId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/tags/${tagId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Tag nenalezen');
    throw new Error('Nepodařilo se smazat tag');
  }
}

export async function fetchItemTags(itemId: string): Promise<WatchlistTag[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/items/${itemId}/tags`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst tagy položky');
  }
  
  return response.json();
}

export async function setItemTags(itemId: string, tagIds: string[]): Promise<WatchlistTag[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/items/${itemId}/tags`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ tag_ids: tagIds }),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se nastavit tagy');
  }
  
  return response.json();
}
