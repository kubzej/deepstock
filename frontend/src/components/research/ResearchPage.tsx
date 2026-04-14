/**
 * Research Page - Ticker-driven research workspace
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  BookOpen,
  ChevronDown,
  FolderPlus,
  Layers3,
  PenLine,
  Search,
  Target,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PriceChart } from '@/components/charts';
import {
  EmptyState,
  ErrorState,
  PageIntro,
  PageShell,
} from '@/components/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { fetchStockInfo, type WatchlistItemWithSource } from '@/lib/api';
import { ValuationSection } from '@/components/research/ValuationSection';
import { StockHeader } from '@/components/research/sections/StockHeader';
import { TechnicalSection } from '@/components/research/sections/TechnicalSection';
import { AIResearchSection } from '@/components/research/sections/AIResearchSection';
import { SmartAnalysisPanel } from '@/components/research/sections/SmartAnalysisPanel';
import { HistoricalFinancialsSection } from '@/components/research/sections/HistoricalFinancialsSection';
import { QuickJournalSheet } from '@/components/research/sections/QuickJournalSheet';
import { QuickJournalPanel } from '@/components/research/sections/QuickJournalPanel';
import { useJournalChannels } from '@/hooks/useJournal';
import {
  useAddWatchlistItem,
  useAllWatchlistItems,
  useDeleteWatchlistItem,
  useMoveWatchlistItem,
  useUpdateWatchlistItem,
  useWatchlists,
} from '@/hooks/useWatchlists';
import { queryKeys } from '@/lib/queryClient';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  WatchlistItemFormDialog,
  type WatchlistItemFormData,
} from '@/components/watchlists/WatchlistItemFormDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type MainSectionKey = 'fundamentals' | 'valuation' | 'technical' | 'ai';

const DEFAULT_SECTIONS: Record<MainSectionKey, boolean> = {
  fundamentals: false,
  valuation: false,
  technical: false,
  ai: false,
};

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const update = () => setIsDesktop(mediaQuery.matches);

    update();
    mediaQuery.addEventListener('change', update);

    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

interface WorkflowSectionProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function WorkflowSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: WorkflowSectionProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/30"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && <div className="border-t border-border/60 px-5 py-5">{children}</div>}
      {open && (
        <button
          type="button"
          className="flex w-full items-center justify-center border-t border-border/40 px-5 py-3 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
          onClick={onToggle}
          aria-label={`Sbalit sekci ${title}`}
        >
          <ChevronDown className="h-4 w-4 rotate-180" />
        </button>
      )}
    </section>
  );
}

function ResearchTriageChart({
  ticker,
  currency,
}: {
  ticker: string;
  currency: string;
}) {
  return (
    <section className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Cenový Kontext
      </p>
      <div className="rounded-xl border border-border/70 p-4">
        <PriceChart ticker={ticker} currency={currency} height={300} />
      </div>
    </section>
  );
}

export function ResearchPage() {
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  const [ticker, setTicker] = useState('');
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [notesPinned, setNotesPinned] = useState(false);
  const [notesOptedOut, setNotesOptedOut] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteEditorKey, setNoteEditorKey] = useState(0);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [sections, setSections] =
    useState<Record<MainSectionKey, boolean>>(DEFAULT_SECTIONS);
  const [watchlistDialogOpen, setWatchlistDialogOpen] = useState(false);
  const [editingWatchlistItem, setEditingWatchlistItem] =
    useState<WatchlistItemWithSource | null>(null);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(
    null,
  );
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetWatchlistId, setMoveTargetWatchlistId] = useState<string | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [watchlistActionPending, setWatchlistActionPending] = useState(false);

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } =
    useQuery({
      queryKey: ['stockInfo', activeTicker],
      queryFn: () => fetchStockInfo(activeTicker!),
      enabled: !!activeTicker,
      staleTime: 5 * 60 * 1000,
    });

  const { data: channels = [] } = useJournalChannels();
  const { data: watchlists = [] } = useWatchlists();
  const { data: allWatchlistItems = [] } = useAllWatchlistItems();
  const addWatchlistItem = useAddWatchlistItem();
  const updateWatchlistItem = useUpdateWatchlistItem();
  const deleteWatchlistItem = useDeleteWatchlistItem();
  const moveWatchlistItem = useMoveWatchlistItem();

  const journalChannel = activeTicker
    ? (channels.find((channel) => channel.ticker === activeTicker) ?? null)
    : null;

  const matchingWatchlistItems = useMemo(
    () =>
      activeTicker
        ? allWatchlistItems.filter(
            (item) => item.stocks.ticker.toUpperCase() === activeTicker,
          )
        : [],
    [activeTicker, allWatchlistItems],
  );

  const primaryWatchlistItem =
    matchingWatchlistItems.length === 1 ? matchingWatchlistItems[0] : null;

  const watchlistSummary = useMemo(() => {
    if (!activeTicker) return null;

    if (matchingWatchlistItems.length === 0) {
      return {
        kind: 'untracked' as const,
        title: 'Mimo watchlist',
        description: 'Ticker zatím není v žádném watchlistu.',
      };
    }

    if (matchingWatchlistItems.length === 1 && primaryWatchlistItem) {
      return {
        kind: 'tracked' as const,
        title: `Ve watchlistu ${primaryWatchlistItem.watchlist_name}`,
        description: 'Ticker už je zařazený a můžeš s ním rovnou pracovat.',
      };
    }

    return {
      kind: 'multiple' as const,
      title: 'Ticker je ve více watchlistech',
      description: matchingWatchlistItems
        .map((item) => item.watchlist_name)
        .join(' · '),
    };
  }, [activeTicker, matchingWatchlistItems, primaryWatchlistItem]);

  const defaultWatchlistId = useMemo(() => {
    const toAnalyze = watchlists.find((watchlist) => watchlist.name === 'To Analyze');
    return toAnalyze?.id ?? watchlists[0]?.id ?? null;
  }, [watchlists]);

  useEffect(() => {
    setSections(DEFAULT_SECTIONS);
    setNoteDraft('');
    setNoteEditorKey((key) => key + 1);
    setNoteSheetOpen(false);
    setNotesPinned(false);
    setNotesOptedOut(false);
  }, [activeTicker]);

  useEffect(() => {
    if (!journalChannel) {
      setNoteSheetOpen(false);
      setNotesPinned(false);
      return;
    }

    if (isDesktop) {
      if (!notesOptedOut) {
        setNotesPinned(true);
        setNoteSheetOpen(false);
      }
      return;
    }

    setNotesPinned(false);
  }, [isDesktop, journalChannel, notesOptedOut]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ticker.trim().toUpperCase();
    if (trimmed) {
      setActiveTicker(trimmed);
      setDescriptionExpanded(false);
    }
  };

  const toggleSection = (section: MainSectionKey) => {
    setSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const resetNotesDraft = () => {
    setNoteDraft('');
    setNoteEditorKey((key) => key + 1);
  };

  const openNotes = () => {
    if (!journalChannel) return;
    if (isDesktop) {
      setNotesOptedOut(false);
      setNotesPinned(true);
      setNoteSheetOpen(false);
      return;
    }
    setNoteSheetOpen(true);
  };

  const closeNotesSheet = () => {
    setNoteSheetOpen(false);
    resetNotesDraft();
  };

  const closeNotesPanel = () => {
    setNotesPinned(false);
    setNotesOptedOut(true);
    setNoteSheetOpen(false);
    resetNotesDraft();
  };

  const pinNotes = () => {
    setNotesOptedOut(false);
    setNotesPinned(true);
    setNoteSheetOpen(false);
  };

  const unpinNotes = () => {
    setNotesPinned(false);
    setNotesOptedOut(true);
    setNoteSheetOpen(false);
  };

  const openAddToWatchlist = () => {
    if (watchlists.length === 0) return;
    setEditingWatchlistItem(null);
    setSelectedWatchlistId(defaultWatchlistId);
    setWatchlistDialogOpen(true);
  };

  const openEditWatchlist = () => {
    if (!primaryWatchlistItem) return;
    setEditingWatchlistItem(primaryWatchlistItem);
    setSelectedWatchlistId(primaryWatchlistItem.watchlist_id);
    setWatchlistDialogOpen(true);
  };

  const openMoveWatchlist = () => {
    if (!primaryWatchlistItem) return;

    const nextWatchlist =
      watchlists.find((watchlist) => watchlist.id !== primaryWatchlistItem.watchlist_id)
        ?.id ?? null;
    setMoveTargetWatchlistId(nextWatchlist);
    setMoveDialogOpen(true);
  };

  const handleSaveWatchlistItem = async (formData: WatchlistItemFormData) => {
    setWatchlistActionPending(true);

    try {
      if (editingWatchlistItem) {
        await updateWatchlistItem.mutateAsync({
          itemId: editingWatchlistItem.id,
          watchlistId: editingWatchlistItem.watchlist_id,
          targetBuyPrice: formData.buyTarget ? parseFloat(formData.buyTarget) : null,
          targetSellPrice: formData.sellTarget ? parseFloat(formData.sellTarget) : null,
          notes: formData.notes.trim() || null,
          sector: formData.sector.trim() || null,
        });
      } else {
        if (!selectedWatchlistId || !formData.ticker.trim()) return;

        await addWatchlistItem.mutateAsync({
          watchlistId: selectedWatchlistId,
          ticker: formData.ticker.trim().toUpperCase(),
          targetBuyPrice: formData.buyTarget
            ? parseFloat(formData.buyTarget)
            : undefined,
          targetSellPrice: formData.sellTarget
            ? parseFloat(formData.sellTarget)
            : undefined,
          notes: formData.notes.trim() || undefined,
          sector: formData.sector.trim() || undefined,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
      }

      setWatchlistDialogOpen(false);
      setEditingWatchlistItem(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Nepodařilo se uložit');
    } finally {
      setWatchlistActionPending(false);
    }
  };

  const handleMoveTrackedItem = async () => {
    if (!primaryWatchlistItem || !moveTargetWatchlistId) return;

    setWatchlistActionPending(true);
    try {
      await moveWatchlistItem.mutateAsync({
        itemId: primaryWatchlistItem.id,
        fromWatchlistId: primaryWatchlistItem.watchlist_id,
        toWatchlistId: moveTargetWatchlistId,
      });
      setMoveDialogOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Nepodařilo se přesunout');
    } finally {
      setWatchlistActionPending(false);
    }
  };

  const handleDeleteTrackedItem = async () => {
    if (!primaryWatchlistItem) return;

    setWatchlistActionPending(true);
    try {
      await deleteWatchlistItem.mutateAsync({
        itemId: primaryWatchlistItem.id,
        watchlistId: primaryWatchlistItem.watchlist_id,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() });
      setDeleteDialogOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Nepodařilo se odebrat');
    } finally {
      setWatchlistActionPending(false);
    }
  };

  return (
    <TooltipProvider>
      <PageShell width="full" gap="lg">
        <PageIntro
          title="Průzkum akcie"
          onRefresh={activeTicker ? () => refetch() : undefined}
          isRefreshing={isFetching}
          dataUpdatedAt={activeTicker ? dataUpdatedAt : undefined}
        />

        <form onSubmit={handleSubmit} className="flex max-w-md gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Zadejte ticker..."
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="pl-10"
              maxLength={10}
            />
          </div>
          <Button type="submit" disabled={!ticker.trim() || isLoading}>
            Analyzovat
          </Button>
        </form>

        {!activeTicker && (
          <EmptyState
            icon={Search}
            title="Zadej ticker k analýze"
            description="Vyhledej akcii a otevři průzkum v pořadí, ve kterém ji opravdu hodnotíš."
          />
        )}

        {activeTicker && isLoading && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-6 w-64" />
            </div>
            <Skeleton className="h-[360px] w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </div>
        )}

        {activeTicker && error && (
          <ErrorState
            title="Nepodařilo se načíst data akcie"
            description={`Data pro ${activeTicker} se teď nepodařilo načíst.`}
            retryAction={{ label: 'Zkusit znovu', onClick: () => refetch() }}
          />
        )}

        {!isLoading && !error && activeTicker && !data && (
          <EmptyState
            icon={Search}
            title="Ticker nebyl nalezen"
            description={`Pro ${activeTicker} jsem nenašel žádná data. Zkus jiný ticker nebo zkontroluj zápis.`}
          />
        )}

        {data && (
          <div
            className={cn(
              'grid gap-6',
              notesPinned && journalChannel && 'xl:grid-cols-[minmax(0,1fr)_380px]',
            )}
          >
            <div className="min-w-0 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <StockHeader data={data} />
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 hidden shrink-0 gap-2 text-muted-foreground hover:text-foreground md:inline-flex"
                  onClick={openNotes}
                  disabled={!journalChannel}
                  title={
                    journalChannel
                      ? 'Otevřít poznámky'
                      : 'Poznámky budou dostupné po vytvoření deníkového kanálu'
                  }
                >
                  <PenLine className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Poznámky</span>
                  {journalChannel?.entry_count ? (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                      {journalChannel.entry_count}
                    </span>
                  ) : null}
                </Button>
              </div>

              {watchlistSummary && (
                <div className="flex flex-col gap-3 rounded-xl border border-border/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Layers3 className="h-4 w-4 text-muted-foreground" />
                      <span>{watchlistSummary.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {watchlistSummary.description}
                    </p>
                    {!journalChannel && (
                      <p className="text-xs text-muted-foreground">
                        Poznámky se zpřístupní, jakmile ticker dostane journal
                        channel.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {watchlistSummary.kind === 'untracked' && (
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={openAddToWatchlist}
                        disabled={watchlists.length === 0}
                      >
                        <FolderPlus className="h-4 w-4" />
                        Přidat do watchlistu
                      </Button>
                    )}

                    {watchlistSummary.kind === 'tracked' && primaryWatchlistItem && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={openEditWatchlist}
                        >
                          <Target className="h-4 w-4" />
                          Upravit buy zone
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={openMoveWatchlist}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                          Přesunout
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-2 text-negative hover:text-negative"
                          onClick={() => setDeleteDialogOpen(true)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Odebrat
                        </Button>
                      </>
                    )}

                    {watchlistSummary.kind === 'multiple' && (
                      <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                        <BookOpen className="h-3.5 w-3.5" />
                        Fallback stav, ne primární workflow
                      </div>
                    )}
                  </div>
                </div>
              )}

              {data.description && (
                <div className="space-y-1">
                  <p
                    className={[
                      'max-w-5xl text-sm leading-relaxed text-muted-foreground/90 [overflow-wrap:anywhere]',
                      descriptionExpanded ? '' : 'line-clamp-2',
                    ].join(' ')}
                  >
                    {data.description}
                  </p>
                  {data.description.length > 220 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-0 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setDescriptionExpanded((expanded) => !expanded)
                      }
                    >
                      {descriptionExpanded ? 'Méně' : 'Více'}
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-6">
                <ResearchTriageChart
                  ticker={data.symbol}
                  currency={data.currency ?? 'USD'}
                />

                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    První Filtr
                  </p>
                  <SmartAnalysisPanel data={data} />
                </div>
              </div>

              <div className="space-y-4">
                <WorkflowSection
                  title="Fundamenty"
                  open={sections.fundamentals}
                  onToggle={() => toggleSection('fundamentals')}
                >
                  <HistoricalFinancialsSection ticker={data.symbol} />
                </WorkflowSection>

                <WorkflowSection
                  title="Valuace"
                  open={sections.valuation}
                  onToggle={() => toggleSection('valuation')}
                >
                  <ValuationSection data={data} />
                </WorkflowSection>

                <WorkflowSection
                  title="Technika"
                  open={sections.technical}
                  onToggle={() => toggleSection('technical')}
                >
                  <TechnicalSection
                    ticker={data.symbol}
                    currency={data.currency ?? 'USD'}
                  />
                </WorkflowSection>

                <WorkflowSection
                  title="AI report"
                  open={sections.ai}
                  onToggle={() => toggleSection('ai')}
                >
                  <AIResearchSection
                    ticker={data.symbol}
                    currentPrice={data.price}
                  />
                </WorkflowSection>
              </div>
            </div>

            {notesPinned && journalChannel && isDesktop && (
              <QuickJournalPanel
                channel={journalChannel}
                draftHtml={noteDraft}
                editorKey={noteEditorKey}
                onDraftChange={setNoteDraft}
                onResetDraft={resetNotesDraft}
                onClose={closeNotesPanel}
                onUnpin={unpinNotes}
              />
            )}
          </div>
        )}

        {journalChannel && (
          <QuickJournalSheet
            channel={journalChannel}
            open={noteSheetOpen}
            onClose={closeNotesSheet}
            onPin={isDesktop ? pinNotes : undefined}
            draftHtml={noteDraft}
            editorKey={noteEditorKey}
            onDraftChange={setNoteDraft}
            onResetDraft={resetNotesDraft}
          />
        )}

        {journalChannel && !isDesktop && activeTicker && (
          <Button
            type="button"
            size="icon"
            className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-lg md:hidden"
            onClick={openNotes}
            aria-label="Otevřít poznámky"
          >
            <PenLine className="h-4 w-4" />
          </Button>
        )}

        <WatchlistItemFormDialog
          open={watchlistDialogOpen}
          onOpenChange={(open) => {
            setWatchlistDialogOpen(open);
            if (!open) {
              setEditingWatchlistItem(null);
            }
          }}
          editingItem={editingWatchlistItem}
          onSave={handleSaveWatchlistItem}
          saving={watchlistActionPending}
          watchlists={watchlists}
          selectedWatchlistId={selectedWatchlistId}
          onSelectedWatchlistChange={setSelectedWatchlistId}
          initialTicker={editingWatchlistItem ? undefined : data?.symbol}
          initialSector={editingWatchlistItem ? undefined : data?.sector}
        />

        <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Přesunout do jiného watchlistu</DialogTitle>
              <DialogDescription>
                Vyberte cílový watchlist pro {primaryWatchlistItem?.stocks.ticker}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Select
                value={moveTargetWatchlistId ?? undefined}
                onValueChange={setMoveTargetWatchlistId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Vyberte watchlist..." />
                </SelectTrigger>
                <SelectContent>
                  {watchlists
                    .filter(
                      (watchlist) => watchlist.id !== primaryWatchlistItem?.watchlist_id,
                    )
                    .map((watchlist) => (
                      <SelectItem key={watchlist.id} value={watchlist.id}>
                        {watchlist.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
                Zrušit
              </Button>
              <Button
                onClick={handleMoveTrackedItem}
                disabled={!moveTargetWatchlistId || watchlistActionPending}
              >
                Přesunout
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Odebrat ticker z watchlistu?"
          description={
            primaryWatchlistItem
              ? `Položka ${primaryWatchlistItem.stocks.ticker} bude odebrána z watchlistu ${primaryWatchlistItem.watchlist_name}.`
              : undefined
          }
          confirmLabel="Odebrat"
          onConfirm={handleDeleteTrackedItem}
          loading={watchlistActionPending}
        />
      </PageShell>
    </TooltipProvider>
  );
}
