/**
 * Hooks for Transaction History Page
 */
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import {
  fetchTransactionHistory,
  fetchAllTransactionsPage,
  fetchOptionTransactions,
  type Transaction,
  type OptionTransaction,
} from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Fetch the complete stock transaction history across all portfolios.
 * Longer stale time - transactions only change via user CRUD.
 */
export function useAllTransactions() {
  return useQuery<Transaction[]>({
    queryKey: queryKeys.transactionHistory(),
    queryFn: fetchTransactionHistory,
    staleTime: STALE_TIMES.transactions,
    gcTime: GC_TIMES.medium,
  });
}

/**
 * Paginated infinite query for TransactionHistoryPage.
 * Loads 100 transactions at a time, cursor-based (newest first).
 */
export function useInfiniteTransactions(pageSize: number = 100) {
  return useInfiniteQuery({
    queryKey: queryKeys.infiniteTransactions(pageSize),
    queryFn: ({ pageParam }) =>
      fetchAllTransactionsPage(pageSize, pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: STALE_TIMES.transactions,
    gcTime: GC_TIMES.medium,
  });
}

/**
 * Fetch the complete option transaction history across all portfolios.
 */
export function useAllOptionTransactions() {
  return useQuery<OptionTransaction[]>({
    queryKey: queryKeys.optionTransactionHistory(),
    queryFn: () => fetchOptionTransactions(),
    staleTime: STALE_TIMES.transactions,
    gcTime: GC_TIMES.medium,
  });
}
