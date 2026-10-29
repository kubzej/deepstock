import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchStocks,
  fetchStock,
  createStock,
  updateStock,
  deleteStock,
  type Stock,
  type StockUpdate,
} from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';
import { invalidateJournal } from './useJournal';
import { invalidateWatchlistItems } from './useWatchlists';

/**
 * Hook for fetching all stocks (master data).
 * Long stale time - master data rarely changes.
 */
export function useStocks() {
  return useQuery({
    queryKey: queryKeys.stocks(),
    queryFn: () => fetchStocks(500),
    staleTime: STALE_TIMES.stocks,
    gcTime: GC_TIMES.long,
  });
}

/**
 * Hook for fetching a single stock by ticker.
 */
export function useStock(ticker: string) {
  return useQuery({
    queryKey: queryKeys.stock(ticker),
    queryFn: () => fetchStock(ticker),
    enabled: !!ticker,
    staleTime: STALE_TIMES.stocks,
    gcTime: GC_TIMES.long,
  });
}

/**
 * Hook for creating a new stock.
 */
export function useCreateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<Stock, 'id' | 'created_at'>) => createStock(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stocks() });
      // The server opens a journal channel for every new stock
      queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
    },
  });
}

/**
 * Hook for updating a stock.
 */
export function useUpdateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: StockUpdate }) =>
      updateStock(id, data),
    onSuccess: (updatedStock) => {
      // Update in list cache
      queryClient.setQueryData<Stock[]>(queryKeys.stocks(), (old) =>
        old?.map((s) => (s.id === updatedStock.id ? updatedStock : s))
      );
      // Update individual cache
      queryClient.setQueryData(
        queryKeys.stock(updatedStock.ticker),
        updatedStock
      );
      // Watchlist items embed the stock's sector, industry and name
      invalidateWatchlistItems(queryClient);
    },
  });
}

/**
 * Hook for deleting a stock.
 */
export function useDeleteStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteStock(id),
    onSuccess: (_, deletedId) => {
      // Remove from list cache
      queryClient.setQueryData<Stock[]>(queryKeys.stocks(), (old) =>
        old?.filter((s) => s.id !== deletedId)
      );
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.stocks() });
      // Deleting a stock removes all its transactions and holdings
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['openLots'] });
      queryClient.invalidateQueries({ queryKey: ['portfolioSnapshot'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionHistory() });
      queryClient.invalidateQueries({ queryKey: ['infiniteTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['stockPerformance'] });
      // The stock's journal channel and its entries are deleted with it
      invalidateJournal(queryClient);
    },
  });
}
