import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTransactions,
  fetchAllTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/lib/api';
import type { Transaction, TransactionUpdateData } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook for fetching transactions for a specific portfolio.
 */
export function useTransactions(portfolioId: string | null, limit = 100) {
  return useQuery({
    queryKey: portfolioId 
      ? queryKeys.transactions(portfolioId) 
      : queryKeys.allTransactions(),
    queryFn: () => portfolioId 
      ? fetchTransactions(portfolioId, limit) 
      : fetchAllTransactions(limit),
    enabled: portfolioId !== undefined,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook for fetching transactions for a specific ticker.
 */
export function useTickerTransactions(
  portfolioId: string | null,
  ticker: string,
  isAllPortfolios = false
) {
  const { data: allTransactions, ...rest } = useTransactions(
    isAllPortfolios ? null : portfolioId
  );

  // Filter by ticker client-side
  const transactions = allTransactions?.filter((t) => t.ticker === ticker) ?? [];

  return { data: transactions, ...rest };
}

/**
 * Hook for deleting a transaction.
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portfolioId, transactionId }: { portfolioId: string; transactionId: string }) => 
      deleteTransaction(portfolioId, transactionId),
    onSuccess: () => {
      // Invalidate all transactions queries
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      // Also invalidate holdings as they may have changed
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['openLots'] });
    },
  });
}

/**
 * Hook for adding a new transaction.
 */
export function useAddTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      portfolioId, 
      data 
    }: { 
      portfolioId: string; 
      data: Omit<Transaction, 'id' | 'portfolio_id'>
    }) => addTransaction(portfolioId, data),
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['openLots'] });
    },
  });
}

/**
 * Hook for updating an existing transaction.
 */
export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      portfolioId, 
      transactionId, 
      data 
    }: { 
      portfolioId: string; 
      transactionId: string;
      data: TransactionUpdateData;
    }) => updateTransaction(portfolioId, transactionId, data),
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['openLots'] });
    },
  });
}
