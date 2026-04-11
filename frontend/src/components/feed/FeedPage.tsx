/**
 * Feed Page — all feed lists as cards, each with its own AI summary
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Rss, RefreshCw, Loader2, Bot } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  EmptyState,
  ErrorState,
  GenerationState,
  LoadingState,
  PageIntro,
  PageShell,
} from '@/components/shared';
import {
  ReportMeta,
  MarkdownReport,
} from '@/components/shared/AIReportComponents';
import {
  UtilityList,
  UtilityListItem,
  UtilitySection,
} from '@/components/settings/UtilityScreen';
import {
  fetchFeedLists,
  getCachedFeedSummary,
  generateFeedSummary,
  type FeedList,
  type FeedSummaryResponse,
} from '@/lib/api/feed';

const SOURCE_LABELS: Record<string, string> = {
  x: 'X.com',
};

function FeedListCard({ list }: { list: FeedList }) {
  const [generated, setGenerated] = useState<FeedSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { data: cached } = useQuery({
    queryKey: ['feed-summary', list.id],
    queryFn: () => getCachedFeedSummary(list.id),
    retry: false,
    staleTime: Infinity,
  });

  const summary = generated ?? cached ?? null;

  const accounts = list.feed_list_accounts ?? [];
  const sourceLabel = SOURCE_LABELS[list.source] ?? list.source;

  const handleGenerate = async (force = false) => {
    setLoading(true);
    setError(null);
    setExpanded(true);
    try {
      const result = await generateFeedSummary(list.id, force);
      setGenerated(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Neznámá chyba');
    } finally {
      setLoading(false);
    }
  };

  return (
    <UtilityListItem className="overflow-hidden px-0 py-0">
      {/* Card header row */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium truncate">{list.name}</span>
          <Badge variant="secondary" className="text-xs font-normal shrink-0">
            {sourceLabel}
          </Badge>
        </div>

        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {summary && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleGenerate(true)}
              disabled={loading}
              title="Obnovit"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
          )}
          {!summary && (
            <Button
              size="sm"
              onClick={() => handleGenerate()}
              disabled={loading || accounts.length === 0}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
              {loading ? 'Generuji...' : 'Generovat souhrn'}
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {/* Accounts */}
          <div className="px-4 pb-3 pt-1">
            {accounts.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {accounts.map((a) => (
                  <span
                    key={a.username}
                    className="text-xs text-muted-foreground bg-background border border-border rounded-full px-2.5 py-0.5"
                  >
                    @{a.username}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Žádné účty — přidej je v Nastavení.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 pb-3">
              <ErrorState
                title="Souhrn se nepodařilo vygenerovat"
                description={error}
                retryAction={{
                  label: 'Zkusit znovu',
                  onClick: () => handleGenerate(true),
                }}
              />
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="px-4 pb-4">
              <GenerationState
                title="Generuji souhrn feedu..."
                description="Načítám příspěvky a připravuji AI souhrn. Může to trvat 1 až 2 minuty."
              />
            </div>
          )}

          {/* Summary */}
          {!loading && summary && (
            <div className="px-4 pb-4 space-y-2">
              <ReportMeta
                generated_at={summary.generated_at}
                cached={summary.cached}
                model_used={summary.model_used}
              />
              <MarkdownReport content={summary.markdown} />
            </div>
          )}
        </>
      )}
    </UtilityListItem>
  );
}

export function FeedPage() {
  const navigate = useNavigate();
  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['feed-lists'],
    queryFn: fetchFeedLists,
  });

  return (
    <PageShell width="full">
      <PageIntro
        title="Feeds"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: '/settings/feed-lists' })}
          >
            Spravovat feed listy
          </Button>
        }
      />

      <UtilitySection title="Připravené seznamy">
        {isLoading ? (
          <LoadingState
            title="Načítám feed listy..."
            description="Připravuji dostupné seznamy účtů pro AI souhrny."
            lines={2}
          />
        ) : lists.length === 0 ? (
          <EmptyState
            icon={Rss}
            title="Žádné feed listy"
            description="Nejdřív si vytvoř feed list v Nastavení, aby Feed měl z čeho generovat souhrny."
            action={{
              label: 'Otevřít nastavení feed listů',
              onClick: () => navigate({ to: '/settings/feed-lists' }),
            }}
          />
        ) : (
          <UtilityList className="space-y-3">
            {lists.map((list) => (
              <FeedListCard key={list.id} list={list} />
            ))}
          </UtilityList>
        )}
      </UtilitySection>
    </PageShell>
  );
}
