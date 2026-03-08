/**
 * Feed Page — all feed lists as cards, each with its own AI summary
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Rss, RefreshCw, Loader2, Bot } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import { ReportMeta, MarkdownReport } from '@/components/shared/AIReportComponents';
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
    <div className="bg-muted/30 rounded-xl overflow-hidden">
      {/* Card header row */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium truncate">{list.name}</span>
          <Badge variant="secondary" className="text-xs font-normal shrink-0">{sourceLabel}</Badge>
        </div>

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {summary && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleGenerate(true)} disabled={loading} title="Obnovit">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
          )}
          {!summary && (
            <Button size="sm" onClick={handleGenerate} disabled={loading || accounts.length === 0} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {loading ? 'Analyzuji...' : 'Generovat přehled'}
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
                  <span key={a.username} className="text-xs text-muted-foreground bg-background border border-border rounded-full px-2.5 py-0.5">
                    @{a.username}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Žádné účty — přidej je v Nastavení.</p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 pb-3">
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="px-4 pb-4 flex items-center gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Načítám příspěvky a analyzuji...</p>
                <p className="text-xs">Může trvat 15–30 sekund.</p>
              </div>
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
    </div>
  );
}

export function FeedPage() {
  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['feed-lists'],
    queryFn: fetchFeedLists,
  });

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title="Feeds" subtitle="AI přehled příspěvků ze sledovaných účtů" />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Rss className="w-10 h-10 opacity-30" />
          <p className="text-sm">Žádné feed listy. Vytvoř je v Nastavení → X.com Feed listy.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <FeedListCard key={list.id} list={list} />
          ))}
        </div>
      )}
    </div>
  );
}
