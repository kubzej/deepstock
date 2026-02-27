import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAlerts,
  fetchActiveAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
  resetAlert,
  toggleAlert,
  deleteGroup,
  resetGroup,
  toggleGroup,
  type PriceAlert,
  type PriceAlertCreate,
  type PriceAlertUpdate,
} from '@/lib/api';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Fetch all user price alerts.
 */
export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts(),
    queryFn: fetchAlerts,
    staleTime: STALE_TIMES.alerts,
    gcTime: GC_TIMES.medium,
  });
}

/**
 * Fetch only active (enabled, non-triggered) alerts.
 */
export function useActiveAlerts() {
  return useQuery({
    queryKey: queryKeys.activeAlerts(),
    queryFn: fetchActiveAlerts,
    staleTime: STALE_TIMES.alerts,
    gcTime: GC_TIMES.medium,
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

// ==========================================
// GROUP OPERATIONS (for price range alerts)
// ==========================================

/**
 * Delete all alerts in a group.
 */
export function useDeleteGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (groupId: string) => deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeAlerts() });
    },
  });
}

/**
 * Reset all triggered alerts in a group.
 */
export function useResetGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (groupId: string) => resetGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeAlerts() });
    },
  });
}

/**
 * Toggle all alerts in a group enabled/disabled.
 */
export function useToggleGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (groupId: string) => toggleGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeAlerts() });
    },
  });
}

export type { PriceAlert, PriceAlertCreate, PriceAlertUpdate };
