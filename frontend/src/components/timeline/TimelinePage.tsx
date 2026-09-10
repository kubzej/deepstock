import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CalendarDays, ChevronRight, Clock3, Loader2, Newspaper } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageIntro,
  PageShell,
} from '@/components/shared';
import {
  UtilityList,
  UtilityListItem,
  UtilitySection,
} from '@/components/settings/UtilityScreen';
import { useTimeline } from '@/hooks/useTimeline';
import type { TimelineEvent, TimelineEventType } from '@/lib/api/timeline';
import { formatPrice } from '@/lib/format';

const EVENT_ICONS: Record<TimelineEventType, typeof Newspaper> = {
  daily_briefing: Newspaper,
  earnings: CalendarDays,
  option_expiry: Clock3,
};

function formatTimelineDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function groupEvents(events: TimelineEvent[]) {
  return events.reduce<Array<{ date: string; events: TimelineEvent[] }>>((groups, event) => {
    const group = groups.find((item) => item.date === event.event_date);
    if (group) {
      group.events.push(event);
    } else {
      groups.push({ date: event.event_date, events: [event] });
    }
    return groups;
  }, []);
}

function metadataString(event: TimelineEvent, key: string) {
  const value = event.metadata[key];
  return typeof value === 'string' && value ? value : null;
}

function metadataNumber(event: TimelineEvent, key: string) {
  const value = event.metadata[key];
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  return Number.isFinite(number) ? number : null;
}

function formatTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('cs-CZ', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isNearTimelineDate(value: string | null, eventDate: string) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  const eventTimestamp = new Date(`${eventDate}T00:00:00Z`).getTime();
  if (Number.isNaN(timestamp) || Number.isNaN(eventTimestamp)) return false;
  return Math.abs(timestamp - eventTimestamp) <= 2 * 24 * 60 * 60 * 1000;
}

function formatEventDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

function formatContracts(value: number) {
  if (value === 1) return '1 kontrakt';
  if (value >= 2 && value <= 4) return `${value} kontrakty`;
  return `${value} kontraktů`;
}

function getEventTitle(event: TimelineEvent) {
  if (event.event_type !== 'option_expiry') return event.title;

  const ticker = metadataString(event, 'ticker');
  const optionType = metadataString(event, 'option_type')?.toUpperCase();
  const strike = metadataNumber(event, 'strike_price');
  const currency = metadataString(event, 'currency') || 'USD';
  if (!ticker || !optionType || strike === null) return event.title;

  return `${ticker} ${optionType} ${formatPrice(strike, currency)}`;
}

function getEarningsSubtitle(event: TimelineEvent) {
  const earningsTime = formatTime(metadataString(event, 'earnings_timestamp'));
  const callTimestamp = metadataString(event, 'earnings_call_timestamp');
  const callTime = isNearTimelineDate(callTimestamp, event.event_date)
    ? formatTime(callTimestamp)
    : null;
  const parts = [
    earningsTime ? `Výsledky ${earningsTime}` : null,
    callTime ? `Call ${callTime}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : event.subtitle;
}

function getOptionSubtitle(event: TimelineEvent) {
  const position = metadataString(event, 'position');
  const contracts = metadataNumber(event, 'contracts');
  const expiration = metadataString(event, 'expiration_date');
  const dte = metadataNumber(event, 'dte');
  const parts = [
    position ? (position === 'short' ? 'Short' : 'Long') : null,
    contracts !== null ? formatContracts(contracts) : null,
    expiration ? `expirace ${formatEventDate(expiration)}` : null,
    dte !== null ? `za ${dte} dní` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : event.subtitle;
}

function TimelineEventRow({ event }: { event: TimelineEvent }) {
  const navigate = useNavigate();
  const Icon = EVENT_ICONS[event.event_type];
  const isBriefing = event.event_type === 'daily_briefing' && event.briefing_report_id;
  const title = getEventTitle(event);
  const subtitle = event.event_type === 'earnings'
    ? getEarningsSubtitle(event)
    : event.event_type === 'option_expiry'
      ? getOptionSubtitle(event)
      : event.subtitle;

  const handleClick = () => {
    if (isBriefing) {
      navigate({
        to: '/timeline/briefing/$reportId',
        params: { reportId: event.briefing_report_id as string },
      });
    }
  };

  return (
    <UtilityListItem
      className={`border-0 bg-muted/30 px-3 py-2.5 md:rounded-none md:bg-transparent md:px-0 md:py-4${isBriefing ? ' cursor-pointer transition-colors hover:bg-muted/30' : ''}`}
      onClick={isBriefing ? handleClick : undefined}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-medium">{title}</div>
            {subtitle ? (
              <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
            ) : null}
          </div>
        </div>
        {isBriefing ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      </div>
    </UtilityListItem>
  );
}

export function TimelinePage() {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTimeline();

  const events = useMemo(
    () => data?.pages.flatMap((page) => page.events) ?? [],
    [data],
  );
  const groups = useMemo(() => groupEvents(events), [events]);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <PageShell width="full">
      <PageIntro title="Timeline" />

      {isLoading ? <LoadingState title="Načítám Timeline..." lines={5} /> : null}

      {error ? (
        <ErrorState
          title="Timeline se nepodařilo načíst"
          description={error instanceof Error ? error.message : 'Neznámá chyba'}
          retryAction={{ label: 'Zkusit znovu', onClick: () => window.location.reload() }}
        />
      ) : null}

      {!isLoading && !error && groups.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="Timeline je prázdná"
          description="Automatické události se zde objeví po prvním běhu příslušných jobů."
        />
      ) : null}

      {!isLoading && !error && groups.length > 0 ? (
        <div className="space-y-7">
          {groups.map((group) => (
            <UtilitySection key={group.date} className="space-y-3">
              <div className="flex items-center gap-3 pb-2">
                <h2 className="text-sm font-semibold capitalize">
                  {formatTimelineDate(group.date)}
                </h2>
                <div className="h-px flex-1 bg-border/40" />
              </div>
              <UtilityList className="space-y-1 md:space-y-0">
                {group.events.map((event) => (
                  <TimelineEventRow key={event.id} event={event} />
                ))}
              </UtilityList>
            </UtilitySection>
          ))}
        </div>
      ) : null}

      <div ref={loadMoreRef} className="flex min-h-8 items-center justify-center py-4">
        {isFetchingNextPage ? (
          <div className="flex w-full max-w-md items-center gap-3">
            <Skeleton className="h-10 flex-1" />
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
