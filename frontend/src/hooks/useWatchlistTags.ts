import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchWatchlistTags,
  createWatchlistTag,
  updateWatchlistTag,
  deleteWatchlistTag,
  fetchItemTags,
  setItemTags,
} from '@/lib/api';
import { queryKeys, STALE_TIMES } from '@/lib/queryClient';

/**
 * Fetch all watchlist tags for the user
 */
export function useWatchlistTags() {
  return useQuery({
    queryKey: queryKeys.watchlistTags(),
    queryFn: fetchWatchlistTags,
    staleTime: STALE_TIMES.watchlistTags,
  });
}

/**
 * Fetch tags for a specific watchlist item
 */
export function useItemTags(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.itemTags(itemId || ''),
    queryFn: () => fetchItemTags(itemId!),
    enabled: !!itemId,
    staleTime: STALE_TIMES.itemTags,
  });
}

/**
 * Create a new watchlist tag
 */
export function useCreateWatchlistTag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { name: string; color?: string }) => createWatchlistTag(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlistTags() });
    },
  });
}

/**
 * Update an existing watchlist tag
 */
export function useUpdateWatchlistTag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ tagId, data }: { tagId: string; data: { name?: string; color?: string } }) => 
      updateWatchlistTag(tagId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlistTags() });
      // Also invalidate all item tags as they include tag info
      queryClient.invalidateQueries({ queryKey: queryKeys.itemTags('') });
    },
  });
}

/**
 * Delete a watchlist tag
 */
export function useDeleteWatchlistTag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (tagId: string) => deleteWatchlistTag(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlistTags() });
      queryClient.invalidateQueries({ queryKey: queryKeys.itemTags('') });
    },
  });
}

/**
 * Set tags for a watchlist item (replaces all tags)
 */
export function useSetItemTags() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ itemId, tagIds }: { itemId: string; tagIds: string[] }) => 
      setItemTags(itemId, tagIds),
    onSuccess: (_data, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itemTags(itemId) });
    },
  });
}
