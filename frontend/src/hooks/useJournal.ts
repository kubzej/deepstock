import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchJournalChannels,
  fetchJournalSections,
  fetchJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  deleteJournalChannel,
  type EntryCreateData,
  type JournalEntry,
} from '@/lib/api/journal';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

// ============================================
// Channels
// ============================================

export function useJournalChannels() {
  return useQuery({
    queryKey: queryKeys.journalChannels(),
    queryFn: fetchJournalChannels,
    staleTime: STALE_TIMES.journalChannels,
    gcTime: GC_TIMES.long,
  });
}

// ============================================
// Sections
// ============================================

export function useJournalSections() {
  return useQuery({
    queryKey: queryKeys.journalSections(),
    queryFn: fetchJournalSections,
    staleTime: STALE_TIMES.journalChannels,
    gcTime: GC_TIMES.long,
  });
}

// ============================================
// Entries — infinite scroll
// ============================================

export function useJournalEntries(channelId: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.journalEntries(channelId ?? ''),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchJournalEntries({ channel_id: channelId!, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: JournalEntry[]) => {
      if (lastPage.length < 50) return undefined;
      return lastPage[lastPage.length - 1].created_at;
    },
    enabled: !!channelId,
    staleTime: STALE_TIMES.journalEntries,
    gcTime: GC_TIMES.long,
  });
}

export function useJournalEntriesByTicker(ticker: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.journalEntriesByTicker(ticker ?? ''),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchJournalEntries({ ticker: ticker!, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: JournalEntry[]) => {
      if (lastPage.length < 50) return undefined;
      return lastPage[lastPage.length - 1].created_at;
    },
    enabled: !!ticker,
    staleTime: STALE_TIMES.journalEntries,
    gcTime: GC_TIMES.long,
  });
}

// ============================================
// Mutations
// ============================================

export function useCreateJournalEntry(channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: EntryCreateData) => createJournalEntry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalEntries(channelId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
    },
  });
}

export function useUpdateJournalEntry(channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      updateJournalEntry(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalEntries(channelId) });
    },
  });
}

export function useDeleteJournalEntry(channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJournalEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalEntries(channelId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
    },
  });
}

export function useDeleteJournalChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJournalChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
    },
  });
}
