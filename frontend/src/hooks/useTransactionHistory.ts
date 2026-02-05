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

/**
 * Fetch all stock transactions across all portfolios
 */
export function useAllTransactions(limit: number = 1000) {
  return useQuery<Transaction[]>({
    queryKey: ['all-transactions', limit],
    queryFn: () => fetchAllTransactions(limit),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Fetch all option transactions across all portfolios
 */
export function useAllOptionTransactions(limit: number = 500) {
  return useQuery<OptionTransaction[]>({
    queryKey: ['all-option-transactions', limit],
    queryFn: () => fetchOptionTransactions(undefined, undefined, undefined, limit),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
