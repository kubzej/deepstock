import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAlerts,
  fetchActiveAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
  resetAlert,
  toggleAlert,
  type PriceAlert,
  type PriceAlertCreate,
  type PriceAlertUpdate,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Fetch all user price alerts.
 */
export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts(),
    queryFn: fetchAlerts,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Fetch only active (enabled, non-triggered) alerts.
 */
export function useActiveAlerts() {
  return useQuery({
    queryKey: queryKeys.activeAlerts(),
    queryFn: fetchActiveAlerts,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Create a new price alert.
 */
export function useCreateAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: PriceAlertCreate) => createAlert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeAlerts() });
    },
  });
}

/**
 * Update a price alert.
 */
export function useUpdateAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PriceAlertUpdate }) =>
      updateAlert(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeAlerts() });
    },
  });
}

/**
 * Delete a price alert.
 */
export function useDeleteAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => deleteAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeAlerts() });
    },
  });
}

/**
 * Reset a triggered alert back to active state.
 */
export function useResetAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => resetAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeAlerts() });
    },
  });
}

/**
 * Toggle alert enabled/disabled state.
 */
export function useToggleAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => toggleAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeAlerts() });
    },
  });
}

export type { PriceAlert, PriceAlertCreate, PriceAlertUpdate };
