import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, STALE_TIMES } from '@/lib/queryClient';
import {
  fetchDailyBriefingReport,
  fetchDailyBriefingReports,
  fetchDailyBriefingScopeOptions,
  fetchDailyBriefingSettings,
  fetchDailyBriefingSources,
  generateDailyBriefing,
  updateDailyBriefingScope,
  updateDailyBriefingSettings,
  type DailyBriefingScopeItem,
  type DailyBriefingSettings,
  type DailyNewsReportStatus,
} from '@/lib/api/daily_briefing';

export function useDailyBriefingSettings() {
  return useQuery({
    queryKey: queryKeys.dailyBriefingSettings(),
    queryFn: fetchDailyBriefingSettings,
    staleTime: STALE_TIMES.dailyBriefingSettings,
  });
}

export function useDailyBriefingScopeOptions() {
  return useQuery({
    queryKey: queryKeys.dailyBriefingScopeOptions(),
    queryFn: fetchDailyBriefingScopeOptions,
    staleTime: STALE_TIMES.dailyBriefingSettings,
  });
}

export function useUpdateDailyBriefingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Pick<DailyBriefingSettings, 'enabled' | 'include_market_context'>) =>
      updateDailyBriefingSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyBriefingSettings() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyBriefingScopeOptions() });
    },
  });
}

export function useUpdateDailyBriefingScope() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: DailyBriefingScopeItem[]) => updateDailyBriefingScope(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyBriefingScopeOptions() });
    },
  });
}

export function useDailyBriefingReports(limit = 100) {
  return useQuery({
    queryKey: queryKeys.dailyBriefingReports(),
    queryFn: () => fetchDailyBriefingReports(limit),
    staleTime: STALE_TIMES.dailyBriefingReports,
  });
}

export function useDailyBriefingReport(reportId: string) {
  return useQuery({
    queryKey: queryKeys.dailyBriefingReport(reportId),
    queryFn: () => fetchDailyBriefingReport(reportId),
    enabled: !!reportId,
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 5000 : false,
  });
}

export function useDailyBriefingSources(reportId: string, status?: DailyNewsReportStatus) {
  return useQuery({
    queryKey: queryKeys.dailyBriefingSources(reportId),
    queryFn: () => fetchDailyBriefingSources(reportId),
    enabled: !!reportId && !!status && status !== 'running',
  });
}

export function useGenerateDailyBriefing() {
  const queryClient = useQueryClient();
  return useMutation<
    { report_id: string; status: DailyNewsReportStatus },
    Error,
    boolean
  >({
    mutationFn: (force) => generateDailyBriefing(force),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyBriefingReports() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyBriefingReport(data.report_id) });
    },
  });
}
