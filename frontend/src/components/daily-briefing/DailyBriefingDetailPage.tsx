import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MarkdownReport } from '@/components/shared/AIReportComponents';
import {
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
import { useDailyBriefingReport, useDailyBriefingSources } from '@/hooks/useDailyBriefing';
import type {
  DailyBriefingPriority,
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
  if (status === 'failed' || status === 'degraded') return <AlertTriangle className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function StatusBadge({ status }: { status: DailyNewsReportStatus }) {
  return (
    <Badge variant={status === 'failed' ? 'destructive' : 'outline'} className="gap-1.5">
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

function formatWarning(warning: unknown) {
  const message = typeof warning === 'string'
    ? warning
    : JSON.stringify(warning, null, 2) || String(warning);
  const providerMatch = message.match(/^(.+?) provider gap:\s*(.+)$/i);
  return providerMatch
    ? { title: `${providerMatch[1]} chyba`, description: providerMatch[2] }
    : { title: 'Problém při generování', description: message };
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
        <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Otevřít
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
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
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left">
        <div className="flex min-w-0 items-center gap-3">
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <div className="text-sm font-medium">{SOURCE_GROUP_LABELS[group]}</div>
            <div className="text-xs text-muted-foreground">
              {pluralizeSources(items.length)}{highCount > 0 ? `, ${highCount} vysoká priorita` : ''}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="font-normal">{items.length}</Badge>
      </button>
      {isOpen ? (
        <div className="border-t border-border/60 px-4 py-2">
          <div className="divide-y divide-border/60">
            {items.map((source) => <SourceRow key={source.id} source={source} />)}
          </div>
        </div>
      ) : null}
    </UtilityListItem>
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
  const groups = useMemo(() => sources.reduce<Record<string, DailyNewsSourceItem[]>>((acc, source) => {
    const key = source.scope_type;
    acc[key] = acc[key] || [];
    acc[key].push(source);
    return acc;
  }, {}), [sources]);
  const sortedGroups = useMemo(() => Object.entries(groups).sort(([left], [right]) => {
    const order = ['holding', 'watchlist', 'macro', 'sector', 'market'];
    return order.indexOf(left) - order.indexOf(right);
  }), [groups]);

  if (isLoading) return <LoadingState title="Načítám zdroje..." lines={3} />;
  if (error) return <ErrorState title="Zdroje se nepodařilo načíst" description={error instanceof Error ? error.message : 'Neznámá chyba'} />;
  if (!sources.length) {
    return <UtilityPanel><p className="text-sm text-muted-foreground">{expectedCount > 0 ? 'Report zdroje použil, ale audit trail se zatím nenačetl.' : 'Report nemá uložené žádné zdroje.'}</p></UtilityPanel>;
  }

  return (
    <UtilityList>
      {sortedGroups.map(([group, items]) => (
        <SourceGroup
          key={group}
          group={group as DailyNewsSourceItem['scope_type']}
          items={items}
          isOpen={openGroups.has(group)}
          onToggle={() => setOpenGroups((previous) => {
            const next = new Set(previous);
            if (next.has(group)) next.delete(group); else next.add(group);
            return next;
          })}
        />
      ))}
    </UtilityList>
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

function TickerCoverage({
  scopeSnapshot,
  sources,
}: {
  scopeSnapshot: Record<string, unknown>;
  sources: DailyNewsSourceItem[];
}) {
  const holdings = Array.isArray(scopeSnapshot.holdings) ? scopeSnapshot.holdings as Record<string, unknown>[] : [];
  const watchlistItems = Array.isArray(scopeSnapshot.watchlist_items) ? scopeSnapshot.watchlist_items as Record<string, unknown>[] : [];
  const countsByTicker = sources.reduce<Record<string, { found: number; used: number }>>((acc, source) => {
    if (!source.ticker) return acc;
    const entry = acc[source.ticker] || { found: 0, used: 0 };
    entry.found += 1;
    if (source.used_in_prompt) entry.used += 1;
    acc[source.ticker] = entry;
    return acc;
  }, {});
  const rows = [...holdings.map((item) => ({ item, origin: 'holding' as const })), ...watchlistItems.map((item) => ({ item, origin: 'watchlist' as const }))]
    .filter(({ item }) => item.ticker)
    .map(({ item, origin }) => {
      const ticker = String(item.ticker);
      const counts = countsByTicker[ticker] || { found: 0, used: 0 };
      return {
        ticker,
        name: item.name as string | null | undefined,
        sector: item.sector as string | null | undefined,
        priority: (item.priority as DailyBriefingPriority) || 'medium',
        origin,
        sourcesFound: counts.found,
        usedInPrompt: counts.used,
      };
    })
    .sort((a, b) => a.sourcesFound - b.sourcesFound || a.ticker.localeCompare(b.ticker));

  if (!rows.length) return null;
  const missingCount = rows.filter((row) => row.sourcesFound === 0).length;
  return (
    <UtilitySection title="Pokrytí tickerů">
      <p className="mb-2 text-xs text-muted-foreground">
        {missingCount > 0 ? `${missingCount} z ${rows.length} tickerů bez zachyceného zdroje za toto okno.` : `Všech ${rows.length} sledovaných tickerů mělo alespoň jeden zdroj.`}
      </p>
      <div className="flex flex-wrap gap-1">
        {rows.map((row) => (
          <span key={`${row.origin}:${row.ticker}`} title={`${row.ticker} — ${row.name || row.sector || '—'} · ${COVERAGE_ORIGIN_LABELS[row.origin]} · priorita ${COVERAGE_PRIORITY_LABELS[row.priority]}`} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-mono-price ${row.sourcesFound === 0 ? 'border-rose-500/30 bg-rose-500/10 text-rose-500' : 'border-border bg-muted/40 text-muted-foreground'}`}>
            {row.ticker}<span className="opacity-70">{row.sourcesFound === 0 ? '0' : `${row.sourcesFound}/${row.usedInPrompt}`}</span>
          </span>
        ))}
      </div>
    </UtilitySection>
  );
}

function ReportDetail({ reportId }: { reportId: string }) {
  const navigate = useNavigate();
  const { data: report, isLoading, error } = useDailyBriefingReport(reportId);
  const { data: sourcesData, isLoading: sourcesLoading, error: sourcesError } = useDailyBriefingSources(reportId, report?.status);

  if (isLoading) return <PageShell width="full"><LoadingState title="Načítám briefing..." lines={4} /></PageShell>;
  if (error || !report) return <PageShell width="full"><ErrorState title="Briefing se nepodařilo načíst" description={error instanceof Error ? error.message : 'Report nenalezen'} /></PageShell>;

  const warnings = report.warnings ?? [];
  return (
    <PageShell width="full">
      <PageIntro
        title={report.title || 'Denní briefing'}
        leading={<PageBackButton onClick={() => navigate({ to: '/timeline' })} />}
        meta={<><StatusBadge status={report.status} /><span>{formatDateTime(report.window_start)} - {formatDateTime(report.window_end)}</span>{report.model_used ? <span>{report.model_used}</span> : null}</>}
      />
      {report.status === 'failed' ? <ErrorState title="Generování selhalo" description={report.error || 'Chyba není k dispozici.'} /> : null}
      {warnings.length > 0 ? (
        <UtilitySection title="Problémy při generování">
          <div className="space-y-3">
            {warnings.map((warning, index) => {
              const formatted = formatWarning(warning);
              return <Alert key={index} variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>{formatted.title}</AlertTitle><AlertDescription>{formatted.description}</AlertDescription></Alert>;
            })}
          </div>
        </UtilitySection>
      ) : null}
      {report.markdown ? <MarkdownReport content={report.markdown} /> : null}
      <UtilitySection title="Použité zdroje">
        <SourcesList sources={sourcesData?.sources ?? []} expectedCount={Number(report.source_counts?.persisted ?? 0)} error={sourcesError} isLoading={sourcesLoading} />
      </UtilitySection>
      {!sourcesLoading && !sourcesError ? <TickerCoverage scopeSnapshot={report.scope_snapshot} sources={sourcesData?.sources ?? []} /> : null}
    </PageShell>
  );
}

export function DailyBriefingDetailPage() {
  const params = useParams({ strict: false }) as { reportId?: string };
  return params.reportId ? <ReportDetail reportId={params.reportId} /> : null;
}
