import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  fetchJournalChannels,
  fetchJournalSections,
  fetchJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  deleteJournalChannel,
  createJournalSection,
  updateJournalSection,
  deleteJournalSection,
  createJournalChannel,
  updateJournalChannel,
  type EntryCreateData,
  type JournalEntry,
  type JournalSection,
  type JournalChannel,
} from '@/lib/api/journal';
import { queryKeys, STALE_TIMES, GC_TIMES } from '@/lib/queryClient';

/**
 * Entries are cached per channel and per ticker, so a change to an entry refreshes both.
 * Pass the channel that changed, or none when it can be any (the server wrote the entry).
 */
export function invalidateJournalEntries(queryClient: QueryClient, channelId?: string): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: channelId ? queryKeys.journalEntries(channelId) : queryKeys.anyJournalEntries(),
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.anyJournalEntriesByTicker() }),
  ]);
}

/** Refresh the whole journal: every entry list and the channel list (counts, new channels). */
export function invalidateJournal(queryClient: QueryClient) {
  invalidateJournalEntries(queryClient);
  queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
}

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
      invalidateJournalEntries(queryClient, channelId);
      queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
    },
  });
}

export function useUpdateJournalEntry(channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      updateJournalEntry(id, content),
    // Returned so the editor stays open until the list shows the new text
    onSuccess: () => invalidateJournalEntries(queryClient, channelId),
  });
}

export function useDeleteJournalEntry(channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJournalEntry(id),
    onSuccess: () => {
      invalidateJournalEntries(queryClient, channelId);
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

// ============================================
// Section mutations
// ============================================

export function useCreateJournalSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => createJournalSection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalSections() });
    },
  });
}

export function useReorderJournalSections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      Promise.all(
        orderedIds.map((id, index) => updateJournalSection(id, { sort_order: index })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalSections() });
    },
  });
}

export function useUpdateJournalSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<JournalSection> }) =>
      updateJournalSection(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalSections() });
    },
  });
}

export function useDeleteJournalSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJournalSection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalSections() });
      queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
    },
  });
}

// ============================================
// Channel mutations (custom)
// ============================================

export function useCreateJournalChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; section_id?: string }) => createJournalChannel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
    },
  });
}

export function useUpdateJournalChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<JournalChannel> }) =>
      updateJournalChannel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
    },
  });
}
