/**
 * News components - NewsFeed and NewsPage
 */
import { formatDistanceToNow } from 'date-fns';
import { cs } from 'date-fns/locale';
import { ExternalLink, Newspaper } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import { useNewsFeed } from '@/hooks/useNews';
import { useHoldings } from '@/hooks/useHoldings';
import { useAllWatchlistItems } from '@/hooks/useWatchlists';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { NewsArticle } from '@/lib/api';
import { Button } from '@/components/ui/button';

type FilterMode = 'all' | string;

interface NewsCardProps {
  article: NewsArticle;
}

function NewsCard({ article }: NewsCardProps) {
  const timeAgo = formatDistanceToNow(new Date(article.published_at), {
    addSuffix: true,
    locale: cs,
  });

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors group"
    >
      {/* Thumbnail */}
      {article.thumbnail_url ? (
        <img
          src={article.thumbnail_url}
          alt=""
          className="w-20 h-14 object-cover rounded-lg flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-14 bg-muted rounded-lg flex-shrink-0 flex items-center justify-center">
          <Newspaper className="h-6 w-6 text-muted-foreground/50" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {article.title}
        </h3>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          <span>{article.publisher}</span>
          <span>•</span>
          <span>{timeAgo}</span>
        </div>
        {article.related_tickers.length > 0 && (
          <div className="flex gap-1 mt-2">
            {article.related_tickers.slice(0, 3).map((ticker) => (
              <Badge key={ticker} variant="secondary" className="text-[10px]">
                {ticker}
              </Badge>
            ))}
            {article.related_tickers.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{article.related_tickers.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* External link icon */}
      <ExternalLink className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary flex-shrink-0 mt-1" />
    </a>
  );
}

function NewsCardSkeleton() {
  return (
    <div className="flex gap-4 p-4 rounded-xl bg-muted/30">
      <Skeleton className="w-20 h-14 rounded-lg flex-shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

interface NewsFeedProps {
  tickers: string[];
  limit?: number;
  showHeader?: boolean;
}

export function NewsFeed({
  tickers,
  limit = 30,
  showHeader = false,
}: NewsFeedProps) {
  const { data, isLoading, error } = useNewsFeed(tickers, limit);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {showHeader && <h3 className="text-sm font-semibold mb-3">Novinky</h3>}
        {[...Array(5)].map((_, i) => (
          <NewsCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        Chyba při načítání novinek
      </div>
    );
  }

  if (!data?.articles.length) {
    return (
      <EmptyState
        icon={Newspaper}
        title="Žádné novinky"
        description="Pro vybrané tickery nejsou k dispozici žádné novinky."
      />
    );
  }

  return (
    <div className="space-y-3">
      {showHeader && <h3 className="text-sm font-semibold mb-3">Novinky</h3>}
      {data.articles.map((article) => (
        <NewsCard key={article.id} article={article} />
      ))}
    </div>
  );
}

/**
 * NewsPage - Full page with news from portfolio + watchlists
 */
export function NewsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [visibleCount, setVisibleCount] = useState(10);

  // Get tickers from portfolio holdings (null = all portfolios)
  const { data: holdings = [] } = useHoldings(null);

  // Get tickers from watchlists
  const { data: watchlistItems = [] } = useAllWatchlistItems();

  // All unique tickers
  const allTickers = useMemo(() => {
    const holdingTickers = holdings.map((h) => h.ticker);
    const watchlistTickers = watchlistItems.map((i) => i.stocks.ticker);
    return [...new Set([...holdingTickers, ...watchlistTickers])];
  }, [holdings, watchlistItems]);

  // Filtered tickers based on selected filter
  const filteredTickers = useMemo(() => {
    if (filter === 'all') {
      return allTickers;
    }
    // Single ticker selected
    return [filter];
  }, [filter, allTickers]);

  // News query - fetch more, display limited
  const { data, isLoading, isFetching, dataUpdatedAt } = useNewsFeed(
    filteredTickers,
    100,
  );

  // Visible articles (paginated)
  const visibleArticles = useMemo(
    () => data?.articles.slice(0, visibleCount) || [],
    [data?.articles, visibleCount],
  );

  const hasMore = (data?.articles.length || 0) > visibleCount;

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 10);
  };

  // Reset visible count when filter changes
  const handleFilterChange = (newFilter: FilterMode) => {
    setFilter(newFilter);
    setVisibleCount(10);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['news'] });
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Novinky"
        subtitle={`Články pro ${filteredTickers.length} tickerů`}
        onRefresh={handleRefresh}
        isRefreshing={isFetching}
        dataUpdatedAt={dataUpdatedAt}
      />

      {/* Filter pills */}
      <PillGroup>
        <PillButton
          active={filter === 'all'}
          onClick={() => handleFilterChange('all')}
          size="sm"
        >
          Vše ({allTickers.length})
        </PillButton>
        {allTickers.map((ticker) => (
          <PillButton
            key={ticker}
            active={filter === ticker}
            onClick={() => handleFilterChange(ticker)}
            size="sm"
          >
            {ticker}
          </PillButton>
        ))}
      </PillGroup>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => (
            <NewsCardSkeleton key={i} />
          ))}
        </div>
      ) : !data?.articles.length ? (
        <EmptyState
          icon={Newspaper}
          title="Žádné novinky"
          description="Přidejte akcie do portfolia nebo watchlistů pro zobrazení novinek."
        />
      ) : (
        <div className="space-y-3">
          {visibleArticles.map((article) => (
            <NewsCard key={article.id} article={article} />
          ))}

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                className="w-full max-w-xs"
              >
                Načíst další ({data.articles.length - visibleCount} zbývá)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
