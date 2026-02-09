/**
 * useNews - React Query hook for fetching news articles
 */
import { useQuery } from '@tanstack/react-query';
import { fetchNewsFeed, fetchTickerNews, type NewsFeedResponse } from '@/lib/api';

const NEWS_STALE_TIME = 15 * 60 * 1000; // 15 minutes
const NEWS_GC_TIME = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch aggregated news for a list of tickers.
 */
export function useNewsFeed(tickers: string[], limit: number = 30) {
  const uniqueTickers = [...new Set(tickers)].sort();

  return useQuery<NewsFeedResponse>({
    queryKey: ['news', 'feed', uniqueTickers.join(','), limit],
    queryFn: () => fetchNewsFeed(uniqueTickers, limit),
    staleTime: NEWS_STALE_TIME,
    gcTime: NEWS_GC_TIME,
    enabled: uniqueTickers.length > 0,
    placeholderData: (prev) => prev,
  });
}

/**
 * Fetch news for a single ticker.
 */
export function useTickerNews(ticker: string, limit: number = 10) {
  return useQuery<NewsFeedResponse>({
    queryKey: ['news', 'ticker', ticker, limit],
    queryFn: () => fetchTickerNews(ticker, limit),
    staleTime: NEWS_STALE_TIME,
    gcTime: NEWS_GC_TIME,
    enabled: !!ticker,
    placeholderData: (prev) => prev,
  });
}
