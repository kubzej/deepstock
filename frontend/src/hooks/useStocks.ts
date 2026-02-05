import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchStocks,
  fetchStock,
  createStock,
  updateStock,
  deleteStock,
  type Stock,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

// Query key for all stocks
const stocksKey = ['stocks'] as const;

/**
 * Hook for fetching all stocks (master data).
 */
export function useStocks() {
  return useQuery({
    queryKey: stocksKey,
    queryFn: () => fetchStocks(500),
    staleTime: 10 * 60 * 1000, // 10 minutes - stocks rarely change
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
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook for creating a new stock.
 */
export function useCreateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<Stock, 'id' | 'createdAt'>) => createStock(data),
    onSuccess: () => {
      // Invalidate stocks list to refetch
      queryClient.invalidateQueries({ queryKey: stocksKey });
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
      queryClient.setQueryData<Stock[]>(stocksKey, (old) =>
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
      queryClient.setQueryData<Stock[]>(stocksKey, (old) =>
        old?.filter((s) => s.id !== deletedId)
      );
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: stocksKey });
    },
  });
}
