/**
 * News API - Fetch news articles from the backend
 */
import { API_URL } from './client';

export interface NewsArticle {
  id: string;
  title: string;
  summary: string | null;
  publisher: string;
  published_at: string;
  url: string;
  thumbnail_url: string | null;
  related_tickers: string[];
}

export interface NewsFeedResponse {
  articles: NewsArticle[];
  tickers_requested: string[];
  total: number;
}

/**
 * Fetch aggregated news feed for a list of tickers.
 */
export async function fetchNewsFeed(
  tickers: string[],
  limit: number = 30
): Promise<NewsFeedResponse> {
  if (tickers.length === 0) {
    return { articles: [], tickers_requested: [], total: 0 };
  }

  const tickerParam = tickers.join(',');
  const response = await fetch(
    `${API_URL}/api/news/feed?tickers=${encodeURIComponent(tickerParam)}&limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch news: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch news for a single ticker.
 */
export async function fetchTickerNews(
  ticker: string,
  limit: number = 10
): Promise<NewsFeedResponse> {
  const response = await fetch(
    `${API_URL}/api/news/ticker/${ticker}?limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch news for ${ticker}: ${response.statusText}`);
  }

  return response.json();
}
