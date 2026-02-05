/**
 * Hooks for Transaction History Page
 */
import { useQuery } from '@tanstack/react-query';
import {
  fetchAllTransactions,
  fetchOptionTransactions,
  type Transaction,
  type OptionTransaction,
} from '@/lib/api';
import { STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Fetch all stock transactions across all portfolios.
 * Longer stale time - transactions only change via user CRUD.
 */
export function useAllTransactions(limit: number = 1000) {
  return useQuery<Transaction[]>({
    queryKey: ['all-transactions', limit],
    queryFn: () => fetchAllTransactions(limit),
    staleTime: STALE_TIMES.transactions,
    gcTime: GC_TIMES.medium,
  });
}

/**
 * Fetch all option transactions across all portfolios.
 */
export function useAllOptionTransactions(limit: number = 500) {
  return useQuery<OptionTransaction[]>({
    queryKey: ['all-option-transactions', limit],
    queryFn: () => fetchOptionTransactions(undefined, undefined, undefined, limit),
    staleTime: STALE_TIMES.transactions,
    gcTime: GC_TIMES.medium,
  });
}
