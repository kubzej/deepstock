import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
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
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Refresh everything that shows watchlist items. The per-list items and the cross-list view are
 * copies of the same rows (with their tags, stock details and list name), so they go stale together.
 * Pass the lists that changed, or none when the change can touch any list.
 */
export function invalidateWatchlistItems(queryClient: QueryClient, ...watchlistIds: string[]) {
  if (watchlistIds.length === 0) {
    queryClient.invalidateQueries({ queryKey: queryKeys.anyWatchlistItems() });
  }
  for (const watchlistId of watchlistIds) {
    queryClient.invalidateQueries({ queryKey: queryKeys.watchlistItems(watchlistId) });
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.allWatchlistItems() });
}

/** Refresh the list summaries (counts) and the ticker list, which follow from what the lists contain. */
function invalidateWatchlistSummaries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.watchlists() });
  queryClient.invalidateQueries({ queryKey: queryKeys.watchlistTickers() });
}

/**
 * Fetch all user watchlists.
 */
export function useWatchlists() {
  return useQuery({
    queryKey: queryKeys.watchlists(),
    queryFn: fetchWatchlists,
    staleTime: STALE_TIMES.watchlists,
    gcTime: GC_TIMES.medium,
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
    staleTime: STALE_TIMES.watchlistTickers,
    gcTime: GC_TIMES.medium,
  });
}

/**
 * Fetch ALL items from ALL watchlists.
 * Used for cross-watchlist filtering view.
 */
export function useAllWatchlistItems() {
  return useQuery({
    queryKey: queryKeys.allWatchlistItems(),
    queryFn: fetchAllWatchlistItems,
    staleTime: STALE_TIMES.watchlistItems,
    gcTime: GC_TIMES.medium,
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
    staleTime: STALE_TIMES.watchlistItems,
    gcTime: GC_TIMES.medium,
    // Another list is another subject: never show the previous list's items while it loads
    placeholderData: undefined,
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
      // The cross-list view carries each item's list name
      queryClient.invalidateQueries({ queryKey: queryKeys.allWatchlistItems() });
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
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.watchlistItems(id) });
      invalidateWatchlistSummaries(queryClient);
      invalidateWatchlistItems(queryClient);
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
    }) =>
      addWatchlistItem(data.watchlistId, {
        ticker: data.ticker,
        target_buy_price: data.targetBuyPrice,
        target_sell_price: data.targetSellPrice,
        notes: data.notes,
      }),
    onSuccess: (_data, variables) => {
      invalidateWatchlistItems(queryClient, variables.watchlistId);
      invalidateWatchlistSummaries(queryClient);
      // Adding an unknown ticker creates the stock, and with it a journal channel, on the server
      queryClient.invalidateQueries({ queryKey: queryKeys.stocks() });
      queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
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
    }) =>
      updateWatchlistItem(data.itemId, {
        target_buy_price: data.targetBuyPrice,
        target_sell_price: data.targetSellPrice,
        notes: data.notes,
      }),
    onSuccess: (_data, variables) => {
      invalidateWatchlistItems(queryClient, variables.watchlistId);
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
      invalidateWatchlistItems(queryClient, variables.watchlistId);
      invalidateWatchlistSummaries(queryClient);
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
      invalidateWatchlistItems(queryClient, variables.fromWatchlistId, variables.toWatchlistId);
      invalidateWatchlistSummaries(queryClient);
    },
  });
}
