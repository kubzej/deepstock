import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Newspaper,
  Settings,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MarkdownReport } from '@/components/shared/AIReportComponents';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageBackButton,
  PageIntro,
  PageShell,
} from '@/components/shared';
import {
  UtilityList,
  UtilityListItem,
  UtilityPanel,
  UtilitySection,
} from '@/components/settings/UtilityScreen';
import {
  useDailyBriefingReport,
  useDailyBriefingReports,
  useDailyBriefingSources,
  useGenerateDailyBriefing,
} from '@/hooks/useDailyBriefing';
import type {
  DailyBriefingPriority,
  DailyNewsReport,
  DailyNewsReportStatus,
  DailyNewsSourceItem,
} from '@/lib/api/daily_briefing';

const STATUS_LABELS: Record<DailyNewsReportStatus, string> = {
  running: 'Generuje se',
  succeeded: 'Hotovo',
  degraded: 'Částečné',
  failed: 'Selhalo',
};

function statusIcon(status: DailyNewsReportStatus) {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin" />;
  if (status === 'failed') return <AlertTriangle className="h-4 w-4" />;
  if (status === 'degraded') return <AlertTriangle className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function StatusBadge({ status }: { status: DailyNewsReportStatus }) {
  const variant = status === 'failed' ? 'destructive' : 'outline';
  return (
    <Badge variant={variant} className="gap-1.5">
      {statusIcon(status)}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return 'bez času';
  return new Date(value).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatReportDay(value?: string | null) {
  if (!value) return 'Bez data';
  return new Date(value).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatArchiveDay(value?: string | null) {
  if (!value) return 'Bez data';
  return new Date(value).toLocaleDateString('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

function formatReportMonth(value?: string | null) {
  if (!value) return 'Bez měsíce';
  return new Date(value).toLocaleDateString('cs-CZ', {
    month: 'long',
    year: 'numeric',
  });
}

function pluralizeSources(count: number) {
  if (count === 1) return '1 zdroj';
  if (count > 1 && count < 5) return `${count} zdroje`;
  return `${count} zdrojů`;
}

const SOURCE_GROUP_LABELS: Record<DailyNewsSourceItem['scope_type'], string> = {
  holding: 'Holdings',
  watchlist: 'Watchlist',
  market: 'Trh',
  macro: 'Makro',
  sector: 'Sektory',
};

const SOURCE_IMPORTANCE_LABELS: Record<DailyNewsSourceItem['importance'], string> = {
  high: 'vysoká',
  medium: 'střední',
  low: 'nízká',
  noise: 'šum',
};

const SENTIMENT_LABELS: Record<'positive' | 'negative' | 'neutral', string> = {
  positive: 'pozitivní',
  negative: 'negativní',
  neutral: 'neutrální',
};

const SENTIMENT_CLASSES: Record<'positive' | 'negative' | 'neutral', string> = {
  positive: 'text-emerald-500',
  negative: 'text-rose-500',
  neutral: 'text-muted-foreground',
};

function SentimentBadge({ label }: { label?: 'positive' | 'negative' | 'neutral' | null }) {
  if (!label) return null;
  return <span className={SENTIMENT_CLASSES[label]}>{SENTIMENT_LABELS[label]}</span>;
}

function getPromptSourceCount(report: DailyNewsReport) {
  return Number(report.source_counts?.used_in_prompt ?? 0);
}

function getWarningCount(report: DailyNewsReport) {
  return Array.isArray(report.warnings) ? report.warnings.length : 0;
}

function groupReportsByMonth(reports: DailyNewsReport[]) {
  return reports.reduce<Array<{ key: string; label: string; reports: DailyNewsReport[] }>>(
    (groups, report) => {
      const key = new Date(report.window_end).toISOString().slice(0, 7);
      const existing = groups.find((group) => group.key === key);
      if (existing) {
        existing.reports.push(report);
      } else {
        groups.push({
          key,
          label: formatReportMonth(report.window_end),
          reports: [report],
        });
      }
      return groups;
    },
    [],
  );
}

function formatWarning(warning: unknown) {
  const message =
    typeof warning === 'string'
      ? warning
      : JSON.stringify(warning, null, 2) || String(warning);
  const providerMatch = message.match(/^(.+?) provider gap:\s*(.+)$/i);
  if (!providerMatch) {
    return {
      title: 'Problém při generování',
      description: message,
    };
  }

  return {
    title: `${providerMatch[1]} chyba`,
    description: providerMatch[2],
  };
}

function CurrentReportCard({ report }: { report: DailyNewsReport }) {
  const navigate = useNavigate();
  const promptSourceCount = getPromptSourceCount(report);
  const warningCount = getWarningCount(report);

  return (
    <UtilityListItem
      interactive
      className="cursor-pointer"
      onClick={() => navigate({ to: '/daily-briefing/$reportId', params: { reportId: report.id } })}
    >
      <div className="min-w-0">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold leading-tight">
              {formatReportDay(report.window_end)}
            </h2>
            <StatusBadge status={report.status} />
            <Badge variant="outline" className="text-xs font-normal">
              {report.trigger_type === 'manual' ? 'ruční' : 'cron'}
            </Badge>
            {warningCount > 0 ? (
              <Badge variant="destructive" className="text-xs font-normal">
                {warningCount} problém
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Okno {formatDateTime(report.window_start)} - {formatDateTime(report.window_end)}</span>
            <span>{pluralizeSources(promptSourceCount)} v promptu</span>
          </div>
        </div>

      </div>
    </UtilityListItem>
  );
}

function ArchiveReportRow({ report }: { report: DailyNewsReport }) {
  const navigate = useNavigate();
  const promptSourceCount = getPromptSourceCount(report);
  const warningCount = getWarningCount(report);

  return (
    <UtilityListItem
      interactive
      className="cursor-pointer px-3 py-2.5"
      onClick={() => navigate({ to: '/daily-briefing/$reportId', params: { reportId: report.id } })}
    >
      <div className="grid gap-3 md:grid-cols-[7rem_minmax(0,1fr)] md:items-center">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold">{formatArchiveDay(report.window_end)}</div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge status={report.status} />
          {warningCount > 0 ? (
            <Badge variant="destructive" className="text-xs font-normal">
              {warningCount} problém
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {pluralizeSources(promptSourceCount)}
          </span>
          <span className="text-xs text-muted-foreground">
            {report.trigger_type === 'manual' ? 'ruční' : 'cron'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(report.window_start)} - {formatDateTime(report.window_end)}
          </span>
        </div>

      </div>
    </UtilityListItem>
  );
}

function ReportArchive({ reports }: { reports: DailyNewsReport[] }) {
  const groups = useMemo(() => groupReportsByMonth(reports), [reports]);

  if (!reports.length) {
    return null;
  }

  return (
    <UtilitySection title="Archiv">
      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.key} className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </div>
            <UtilityList>
              {group.reports.map((report) => (
                <ArchiveReportRow key={report.id} report={report} />
              ))}
            </UtilityList>
          </div>
        ))}
      </div>
    </UtilitySection>
  );
}

function SourcesList({
  sources,
  expectedCount,
  error,
  isLoading,
}: {
  sources: DailyNewsSourceItem[];
  expectedCount: number;
  error: unknown;
  isLoading: boolean;
}) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => {
    return sources.reduce<Record<string, DailyNewsSourceItem[]>>((acc, source) => {
      const key = source.scope_type;
      acc[key] = acc[key] || [];
      acc[key].push(source);
      return acc;
    }, {});
  }, [sources]);
  const sortedGroups = useMemo(
    () =>
      Object.entries(groups).sort(([left], [right]) => {
        const order = ['holding', 'watchlist', 'macro', 'sector', 'market'];
        return order.indexOf(left) - order.indexOf(right);
      }),
    [groups],
  );

  const toggleGroup = (group: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  if (isLoading) {
    return <LoadingState title="Načítám zdroje..." lines={3} />;
  }

  if (error) {
    return (
      <ErrorState
        title="Zdroje se nepodařilo načíst"
        description={error instanceof Error ? error.message : 'Neznámá chyba'}
      />
    );
  }

  if (!sources.length) {
    return (
      <UtilityPanel>
        <p className="text-sm text-muted-foreground">
          {expectedCount > 0
            ? 'Report zdroje použil, ale audit trail se zatím nenačetl.'
            : 'Report nemá uložené žádné zdroje.'}
        </p>
      </UtilityPanel>
    );
  }

  return (
    <UtilityList>
      {sortedGroups.map(([group, items]) => (
        <SourceGroup
          key={group}
          group={group as DailyNewsSourceItem['scope_type']}
          items={items}
          isOpen={openGroups.has(group)}
          onToggle={() => toggleGroup(group)}
        />
      ))}
    </UtilityList>
  );
}

function SourceGroup({
  group,
  items,
  isOpen,
  onToggle,
}: {
  group: DailyNewsSourceItem['scope_type'];
  items: DailyNewsSourceItem[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const highCount = items.filter((item) => item.importance === 'high').length;

  return (
    <UtilityListItem className="p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {SOURCE_GROUP_LABELS[group]}
            </div>
            <div className="text-xs text-muted-foreground">
              {pluralizeSources(items.length)}
              {highCount > 0 ? `, ${highCount} vysoká priorita` : ''}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="font-normal">
          {items.length}
        </Badge>
      </button>

      {isOpen ? (
        <div className="border-t border-border/60 px-4 py-2">
          <div className="divide-y divide-border/60">
            {items.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </div>
        </div>
      ) : null}
    </UtilityListItem>
  );
}

function SourceRow({ source }: { source: DailyNewsSourceItem }) {
  return (
    <div className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{source.title}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {source.ticker ? <span>{source.ticker}</span> : null}
          <span>{source.source_name || source.source_type}</span>
          <span>{SOURCE_IMPORTANCE_LABELS[source.importance]}</span>
          <SentimentBadge label={source.sentiment_label} />
          {source.published_at ? <span>{formatDateTime(source.published_at)}</span> : null}
        </div>
      </div>
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Otevřít
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}

type TickerCoverageRow = {
  ticker: string;
  name?: string | null;
  sector?: string | null;
  priority: DailyBriefingPriority;
  origin: 'holding' | 'watchlist';
  sourcesFound: number;
  usedInPrompt: number;
};

const COVERAGE_ORIGIN_LABELS: Record<TickerCoverageRow['origin'], string> = {
  holding: 'Holding',
  watchlist: 'Watchlist',
};

const COVERAGE_PRIORITY_LABELS: Record<DailyBriefingPriority, string> = {
  high: 'Vysoká',
  medium: 'Střední',
  low: 'Nízká',
};

function buildCoverageRows(
  scopeSnapshot: Record<string, unknown>,
  sources: DailyNewsSourceItem[],
): TickerCoverageRow[] {
  const holdings = Array.isArray((scopeSnapshot as { holdings?: unknown })?.holdings)
    ? ((scopeSnapshot as { holdings: Record<string, unknown>[] }).holdings)
    : [];
  const watchlistItems = Array.isArray((scopeSnapshot as { watchlist_items?: unknown })?.watchlist_items)
    ? ((scopeSnapshot as { watchlist_items: Record<string, unknown>[] }).watchlist_items)
    : [];

  const countsByTicker = sources.reduce<Record<string, { found: number; used: number }>>((acc, source) => {
    if (!source.ticker) return acc;
    const entry = acc[source.ticker] || { found: 0, used: 0 };
    entry.found += 1;
    if (source.used_in_prompt) entry.used += 1;
    acc[source.ticker] = entry;
    return acc;
  }, {});

  const toRow = (item: Record<string, unknown>, origin: TickerCoverageRow['origin']): TickerCoverageRow => {
    const ticker = String(item.ticker ?? '');
    const counts = countsByTicker[ticker] || { found: 0, used: 0 };
    return {
      ticker,
      name: (item.name as string | null) ?? null,
      sector: (item.sector as string | null) ?? null,
      priority: (item.priority as DailyBriefingPriority) ?? 'medium',
      origin,
      sourcesFound: counts.found,
      usedInPrompt: counts.used,
    };
  };

  return [
    ...holdings.filter((item) => item.ticker).map((item) => toRow(item, 'holding')),
    ...watchlistItems.filter((item) => item.ticker).map((item) => toRow(item, 'watchlist')),
  ].sort((a, b) => a.sourcesFound - b.sourcesFound || a.ticker.localeCompare(b.ticker));
}

function CoverageChip({ row }: { row: TickerCoverageRow }) {
  const noCoverage = row.sourcesFound === 0;
  const title = `${row.ticker} — ${row.name || row.sector || '—'} · ${COVERAGE_ORIGIN_LABELS[row.origin]} · priorita ${COVERAGE_PRIORITY_LABELS[row.priority]}`;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-mono-price ${
        noCoverage
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
          : 'border-border bg-muted/40 text-muted-foreground'
      }`}
    >
      {row.ticker}
      <span className="opacity-70">
        {noCoverage ? '0' : `${row.sourcesFound}/${row.usedInPrompt}`}
      </span>
    </span>
  );
}

function TickerCoverage({
  scopeSnapshot,
  sources,
}: {
  scopeSnapshot: Record<string, unknown>;
  sources: DailyNewsSourceItem[];
}) {
  const rows = useMemo(() => buildCoverageRows(scopeSnapshot, sources), [scopeSnapshot, sources]);
  if (!rows.length) return null;
  const missingCount = rows.filter((row) => row.sourcesFound === 0).length;

  return (
    <UtilitySection title="Pokrytí tickerů">
      <p className="mb-2 text-xs text-muted-foreground">
        {missingCount > 0
          ? `${missingCount} z ${rows.length} tickerů bez zachyceného zdroje za toto okno. Formát: nalezeno/v promptu.`
          : `Všech ${rows.length} sledovaných tickerů mělo alespoň jeden zdroj. Formát: nalezeno/v promptu.`}
      </p>
      <div className="flex flex-wrap gap-1">
        {rows.map((row) => (
          <CoverageChip key={`${row.origin}:${row.ticker}`} row={row} />
        ))}
      </div>
    </UtilitySection>
  );
}

function ReportDetail({ reportId }: { reportId: string }) {
  const navigate = useNavigate();
  const { data: report, isLoading, error } = useDailyBriefingReport(reportId);
  const {
    data: sourcesData,
    isLoading: sourcesLoading,
    error: sourcesError,
  } = useDailyBriefingSources(reportId, report?.status);

  if (isLoading) {
    return (
      <PageShell width="full">
        <LoadingState title="Načítám briefing..." lines={4} />
      </PageShell>
    );
  }

  if (error || !report) {
    return (
      <PageShell width="full">
        <ErrorState
          title="Briefing se nepodařilo načíst"
          description={error instanceof Error ? error.message : 'Report nenalezen'}
        />
      </PageShell>
    );
  }

  const warnings = report.warnings ?? [];

  return (
    <PageShell width="full">
      <PageIntro
        title={report.title || 'Denní briefing'}
        leading={<PageBackButton onClick={() => navigate({ to: '/daily-briefing' })} />}
        meta={
          <>
            <StatusBadge status={report.status} />
            <span>{formatDateTime(report.window_start)} - {formatDateTime(report.window_end)}</span>
            {report.model_used ? <span>{report.model_used}</span> : null}
          </>
        }
      />

      {report.status === 'failed' ? (
        <ErrorState
          title="Generování selhalo"
          description={report.error || 'Chyba není k dispozici.'}
        />
      ) : null}

      {warnings.length > 0 ? (
        <UtilitySection title="Problémy při generování">
          <div className="space-y-3">
            {warnings.map((warning, index) => {
              const formatted = formatWarning(warning);
              return (
                <Alert key={index} variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{formatted.title}</AlertTitle>
                  <AlertDescription>
                    {formatted.description}
                  </AlertDescription>
                </Alert>
              );
            })}
          </div>
        </UtilitySection>
      ) : null}

      {report.markdown ? (
        <MarkdownReport content={report.markdown} />
      ) : null}

      <UtilitySection title="Použité zdroje">
        <SourcesList
          sources={sourcesData?.sources ?? []}
          expectedCount={Number(report.source_counts?.persisted ?? 0)}
          error={sourcesError}
          isLoading={sourcesLoading}
        />
      </UtilitySection>

      {!sourcesLoading && !sourcesError ? (
        <TickerCoverage scopeSnapshot={report.scope_snapshot} sources={sourcesData?.sources ?? []} />
      ) : null}
    </PageShell>
  );
}

function ReportList() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useDailyBriefingReports();
  const generateMutation = useGenerateDailyBriefing();
  const reports = data?.reports ?? [];
  const latestReport = reports[0];
  const archivedReports = reports.slice(1);

  const handleGenerate = async () => {
    const result = await generateMutation.mutateAsync(false);
    navigate({ to: '/daily-briefing/$reportId', params: { reportId: result.report_id } });
  };

  return (
    <PageShell width="full">
      <PageIntro
        title="Denní briefing"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/settings/daily-briefing' })}
            >
              <Settings className="mr-2 h-4 w-4" />
              Nastavení
            </Button>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              Vygenerovat teď
            </Button>
          </div>
        }
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      {generateMutation.error ? (
        <ErrorState
          title="Briefing se nepodařilo spustit"
          description={generateMutation.error instanceof Error ? generateMutation.error.message : 'Neznámá chyba'}
        />
      ) : null}

      <UtilitySection title="Aktuální briefing">
        {isLoading ? (
          <LoadingState title="Načítám briefing..." lines={4} />
        ) : error ? (
          <ErrorState
            title="Reporty se nepodařilo načíst"
            description={error instanceof Error ? error.message : 'Neznámá chyba'}
          />
        ) : !latestReport ? (
          <EmptyState
            icon={Newspaper}
            title="Žádné briefingy"
            description="Po prvním ručním nebo plánovaném běhu tady uvidíš denní reporty."
            action={{ label: 'Vygenerovat teď', onClick: handleGenerate }}
          />
        ) : (
          <CurrentReportCard report={latestReport} />
        )}
      </UtilitySection>

      {!isLoading && !error ? (
        <ReportArchive reports={archivedReports} />
      ) : null}

    </PageShell>
  );
}

export function DailyBriefingPage() {
  const params = useParams({ strict: false }) as { reportId?: string };
  if (params.reportId) {
    return <ReportDetail reportId={params.reportId} />;
  }
  return <ReportList />;
}
