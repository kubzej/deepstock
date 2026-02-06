import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchWatchlists,
  fetchWatchlistItems,
  fetchAllWatchlistTickers,
  fetchAllWatchlistItems,
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
  addWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
  moveWatchlistItem,
  reorderWatchlists,
  type Watchlist,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Fetch all user watchlists.
 */
export function useWatchlists() {
  return useQuery({
    queryKey: queryKeys.watchlists(),
    queryFn: fetchWatchlists,
    staleTime: Infinity, // Only invalidate manually on CRUD
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Fetch all unique tickers from all watchlists.
 * Used for prefetching quotes on app load.
 */
export function useAllWatchlistTickers() {
  return useQuery({
    queryKey: queryKeys.watchlistTickers(),
    queryFn: fetchAllWatchlistTickers,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Fetch ALL items from ALL watchlists.
 * Used for cross-watchlist filtering view.
 */
export function useAllWatchlistItems() {
  return useQuery({
    queryKey: ['allWatchlistItems'],
    queryFn: fetchAllWatchlistItems,
    staleTime: Infinity, // Only invalidate manually
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Fetch items for a specific watchlist.
 */
export function useWatchlistItems(watchlistId: string | null) {
  return useQuery({
    queryKey: queryKeys.watchlistItems(watchlistId || ''),
    queryFn: () => fetchWatchlistItems(watchlistId!),
    enabled: !!watchlistId,
    staleTime: Infinity, // Only invalidate manually
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Create a new watchlist.
 */
export function useCreateWatchlist() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      createWatchlist(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlists() });
    },
  });
}

/**
 * Update a watchlist.
 */
export function useUpdateWatchlist() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { id: string; name?: string; description?: string }) =>
      updateWatchlist(data.id, { name: data.name, description: data.description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlists() });
    },
  });
}

/**
 * Delete a watchlist.
 */
export function useDeleteWatchlist() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => deleteWatchlist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlists() });
    },
  });
}

/**
 * Reorder watchlists (drag & drop).
 */
export function useReorderWatchlists() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (watchlistIds: string[]) => reorderWatchlists(watchlistIds),
    onMutate: async (newOrder) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.watchlists() });
      
      // Snapshot previous value
      const previousWatchlists = queryClient.getQueryData<Watchlist[]>(
        queryKeys.watchlists()
      );
      
      // Optimistic update
      if (previousWatchlists) {
        const reordered = newOrder
          .map((id) => previousWatchlists.find((w) => w.id === id))
          .filter(Boolean) as Watchlist[];
        queryClient.setQueryData(queryKeys.watchlists(), reordered);
      }
      
      return { previousWatchlists };
    },
    onError: (_err, _newOrder, context) => {
      // Rollback on error
      if (context?.previousWatchlists) {
        queryClient.setQueryData(queryKeys.watchlists(), context.previousWatchlists);
      }
    },
  });
}

/**
 * Add item to watchlist.
 */
export function useAddWatchlistItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: {
      watchlistId: string;
      ticker: string;
      targetBuyPrice?: number;
      targetSellPrice?: number;
      notes?: string;
      sector?: string;
    }) =>
      addWatchlistItem(data.watchlistId, {
        ticker: data.ticker,
        target_buy_price: data.targetBuyPrice,
        target_sell_price: data.targetSellPrice,
        notes: data.notes,
        sector: data.sector,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.watchlistItems(variables.watchlistId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlists() });
    },
  });
}

/**
 * Update watchlist item.
 */
export function useUpdateWatchlistItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: {
      itemId: string;
      watchlistId: string;
      targetBuyPrice?: number | null;
      targetSellPrice?: number | null;
      notes?: string | null;
      sector?: string | null;
    }) =>
      updateWatchlistItem(data.itemId, {
        target_buy_price: data.targetBuyPrice,
        target_sell_price: data.targetSellPrice,
        notes: data.notes,
        sector: data.sector,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.watchlistItems(variables.watchlistId),
      });
    },
  });
}

/**
 * Delete watchlist item.
 */
export function useDeleteWatchlistItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { itemId: string; watchlistId: string }) =>
      deleteWatchlistItem(data.itemId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.watchlistItems(variables.watchlistId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlists() });
    },
  });
}

/**
 * Move item to another watchlist.
 */
export function useMoveWatchlistItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: {
      itemId: string;
      fromWatchlistId: string;
      toWatchlistId: string;
    }) => moveWatchlistItem(data.itemId, data.toWatchlistId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.watchlistItems(variables.fromWatchlistId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.watchlistItems(variables.toWatchlistId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlists() });
    },
  });
}
