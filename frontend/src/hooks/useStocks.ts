import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchStocks,
  fetchStock,
  createStock,
  updateStock,
  deleteStock,
  type Stock,
} from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

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
    },
  });
}

/**
 * Hook for updating a stock.
 */
export function useUpdateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Stock> }) =>
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
    },
  });
}
