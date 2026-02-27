/**
 * React Query hooks for Options
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, STALE_TIMES } from '@/lib/queryClient';
import {
  fetchOptionHoldings,
  fetchOptionTransactions,
  fetchOptionStats,
  createOptionTransaction,
  deleteOptionTransaction,
  deleteOptionTransactionsBySymbol,
  closeOptionPosition,
  type OptionHolding,
  type OptionTransaction,
  type OptionStats,
  type CreateOptionTransactionInput,
  type OptionAction,
} from '@/lib/api';

// ============ Query Hooks ============

/**
 * Fetch option holdings (open positions)
 * @param portfolioId - Optional portfolio filter
 */
export function useOptionHoldings(portfolioId?: string) {
  return useQuery({
    queryKey: queryKeys.optionHoldings(portfolioId),
    queryFn: () => fetchOptionHoldings(portfolioId),
    staleTime: STALE_TIMES.options,
  });
}

/**
 * Fetch option transactions
 * @param portfolioId - Optional portfolio filter
 * @param symbol - Optional underlying symbol filter
 */
export function useOptionTransactions(portfolioId?: string, symbol?: string) {
  return useQuery({
    queryKey: [...queryKeys.optionTransactions(portfolioId), symbol].filter(Boolean),
    queryFn: () => fetchOptionTransactions(portfolioId, symbol),
    staleTime: STALE_TIMES.options,
  });
}

/**
 * Fetch option transactions by OCC option symbol
 * Used for viewing transaction history of a specific option position
 * @param portfolioId - Optional portfolio filter
 * @param optionSymbol - OCC option symbol (e.g., AAPL240315C00150000)
 */
export function useOptionTransactionsBySymbol(portfolioId?: string, optionSymbol?: string) {
  return useQuery({
    queryKey: ['optionTransactions', 'bySymbol', portfolioId, optionSymbol].filter(Boolean),
    queryFn: () => fetchOptionTransactions(portfolioId, undefined, optionSymbol),
    staleTime: STALE_TIMES.options,
    enabled: !!optionSymbol,
  });
}

/**
 * Fetch option statistics
 * @param portfolioId - Optional portfolio filter
 */
export function useOptionStats(portfolioId?: string) {
  return useQuery({
    queryKey: queryKeys.optionStats(portfolioId),
    queryFn: () => fetchOptionStats(portfolioId),
    staleTime: STALE_TIMES.options,
  });
}

// ============ Mutation Hooks ============

/**
 * Create a new option transaction
 */
export function useCreateOptionTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portfolioId, data }: { portfolioId: string; data: CreateOptionTransactionInput }) =>
      createOptionTransaction(portfolioId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optionHoldings'] });
      queryClient.invalidateQueries({ queryKey: ['optionTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['optionStats'] });
    },
  });
}

/**
 * Delete an option transaction
 */
export function useDeleteOptionTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionId: string) => deleteOptionTransaction(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optionHoldings'] });
      queryClient.invalidateQueries({ queryKey: ['optionTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['optionStats'] });
    },
  });
}

/**
 * Delete all transactions for a specific option position
 */
export function useDeleteOptionTransactionsBySymbol() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portfolioId, optionSymbol }: { portfolioId: string; optionSymbol: string }) =>
      deleteOptionTransactionsBySymbol(portfolioId, optionSymbol),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optionHoldings'] });
      queryClient.invalidateQueries({ queryKey: ['optionTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['optionStats'] });
    },
  });
}

/**
 * Close an option position (STC, BTC, EXPIRATION, ASSIGNMENT, EXERCISE)
 */
export function useCloseOptionPosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      portfolioId,
      optionSymbol,
      closingAction,
      contracts,
      closeDate,
      premium,
      fees,
      exchangeRateToCzk,
      notes,
      sourceTransactionId,
    }: {
      portfolioId: string;
      optionSymbol: string;
      closingAction: OptionAction;
      contracts: number;
      closeDate: string;
      premium?: number;
      fees?: number;
      exchangeRateToCzk?: number;
      notes?: string;
      sourceTransactionId?: string;
    }) =>
      closeOptionPosition(
        portfolioId,
        optionSymbol,
        closingAction,
        contracts,
        closeDate,
        premium,
        fees,
        exchangeRateToCzk,
        notes,
        sourceTransactionId
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['optionHoldings'] });
      queryClient.invalidateQueries({ queryKey: ['optionTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['optionStats'] });
      // Also invalidate stock data for ASSIGNMENT/EXERCISE as they create stock transactions
      if (variables.closingAction === 'ASSIGNMENT' || variables.closingAction === 'EXERCISE') {
        queryClient.invalidateQueries({ queryKey: ['holdings'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['openLots'] });
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
        queryClient.invalidateQueries({ queryKey: ['performance'] });
      }
    },
  });
}

// ============ Helper Types ============

export type {
  OptionHolding,
  OptionTransaction,
  OptionStats,
  CreateOptionTransactionInput,
};
