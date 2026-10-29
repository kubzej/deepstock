import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchWatchlistTags,
  createWatchlistTag,
  updateWatchlistTag,
  deleteWatchlistTag,
  setItemTags,
} from '@/lib/api';
import { queryKeys, STALE_TIMES } from '@/lib/queryClient';
import { invalidateWatchlistItems } from './useWatchlists';

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
      // Items carry their tags (name, color), so every list shows the change
      invalidateWatchlistItems(queryClient);
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
      invalidateWatchlistItems(queryClient);
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
    onSuccess: () => {
      // The tags are stored on the item, which may sit in any list
      invalidateWatchlistItems(queryClient);
    },
  });
}
