"""
News service - fetch news from yfinance for given tickers.
"""
import yfinance as yf
import json
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor

from app.core.redis import get_redis
from app.schemas.news import NewsArticle, NewsFeedResponse


# Cache TTL in seconds (15 minutes)
NEWS_CACHE_TTL = 900

# Max articles per ticker
MAX_ARTICLES_PER_TICKER = 5

# Max article age in days
MAX_ARTICLE_AGE_DAYS = 14

# Quality publishers whitelist (case-insensitive partial match)
QUALITY_PUBLISHERS = {
    # Major financial news
    "wall street journal", "wsj", "reuters", "bloomberg", "financial times",
    "cnbc", "marketwatch", "barron's", "investor's business daily", "ibd",
    # Quality analysis
    "simply wall st", "seeking alpha", "motley fool", "zacks", "morningstar",
    # News agencies
    "associated press", "ap news",
    # Tech/business
    "techcrunch", "the verge", "wired", "fortune", "forbes",
    # Regional quality
    "stockstory", "benzinga", "thefly",
}

# Thread pool for yfinance calls (not async-native)
executor = ThreadPoolExecutor(max_workers=5)


def _is_quality_publisher(publisher: str) -> bool:
    """Check if publisher is in our quality whitelist."""
    publisher_lower = publisher.lower()
    return any(q in publisher_lower for q in QUALITY_PUBLISHERS)


def _parse_article(raw: Dict[str, Any], filter_quality: bool = True) -> Optional[NewsArticle]:
    """Parse yfinance news article into NewsArticle schema.
    
    Args:
        raw: Raw article data from yfinance
        filter_quality: If True, filter out low-quality publishers and old articles
    """
    try:
        content = raw.get("content", {})
        if not content:
            return None

        title = content.get("title")
        if not title:
            return None

        # Parse published date
        pub_date_str = content.get("pubDate")
        if pub_date_str:
            # Format: 2026-02-09T00:50:38Z
            published_at = datetime.fromisoformat(pub_date_str.replace("Z", "+00:00"))
        else:
            published_at = datetime.now(timezone.utc)

        # Get provider
        provider = content.get("provider", {})
        publisher = provider.get("displayName", "Unknown")

        # Filter by quality and age
        if filter_quality:
            # Check publisher quality
            if not _is_quality_publisher(publisher):
                return None
            
            # Check article age
            now = datetime.now(timezone.utc)
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
            age = now - published_at
            if age > timedelta(days=MAX_ARTICLE_AGE_DAYS):
                return None

        # Get URL
        canonical = content.get("canonicalUrl", {})
        url = canonical.get("url", "")
        if not url:
            url = content.get("previewUrl", "")

        # Get thumbnail
        thumbnail = content.get("thumbnail", {})
        resolutions = thumbnail.get("resolutions", [])
        thumbnail_url = None
        if resolutions:
            # Get smallest thumbnail (170x128)
            for res in resolutions:
                if res.get("tag") == "170x128":
                    thumbnail_url = res.get("url")
                    break
            if not thumbnail_url and resolutions:
                thumbnail_url = resolutions[0].get("url")

        return NewsArticle(
            id=raw.get("id", ""),
            title=title,
            summary=content.get("summary"),
            publisher=publisher,
            published_at=published_at,
            url=url,
            thumbnail_url=thumbnail_url,
            related_tickers=[],  # Will be populated later
        )
    except Exception as e:
        print(f"Error parsing article: {e}")
        return None


def _fetch_ticker_news(ticker: str) -> List[Dict[str, Any]]:
    """Synchronously fetch news for a single ticker."""
    try:
        t = yf.Ticker(ticker)
        return t.news or []
    except Exception as e:
        print(f"Error fetching news for {ticker}: {e}")
        return []


async def get_news_for_tickers(tickers: List[str], limit: int = 30) -> NewsFeedResponse:
    """
    Fetch and aggregate news for a list of tickers.
    
    - Checks Redis cache first
    - Fetches from yfinance for missing tickers
    - Deduplicates and sorts by date
    - Returns up to `limit` articles
    """
    redis = get_redis()
    all_articles: Dict[str, NewsArticle] = {}  # keyed by article ID for dedup
    tickers_to_fetch: List[str] = []

    # Check cache for each ticker
    for ticker in tickers:
        cache_key = f"news:{ticker}"
        cached = await redis.get(cache_key)
        
        if cached:
            try:
                cached_articles = json.loads(cached)
                for art_dict in cached_articles:
                    art = NewsArticle(**art_dict)
                    if art.id not in all_articles:
                        all_articles[art.id] = art
            except Exception as e:
                print(f"Error loading cached news for {ticker}: {e}")
                tickers_to_fetch.append(ticker)
        else:
            tickers_to_fetch.append(ticker)

    # Fetch missing tickers
    if tickers_to_fetch:
        loop = asyncio.get_event_loop()
        
        # Run yfinance calls in thread pool
        tasks = []
        for ticker in tickers_to_fetch:
            task = loop.run_in_executor(executor, _fetch_ticker_news, ticker)
            tasks.append((ticker, task))

        for ticker, task in tasks:
            raw_news = await task
            ticker_articles = []
            
            for raw in raw_news[:MAX_ARTICLES_PER_TICKER]:
                article = _parse_article(raw)
                if article:
                    article.related_tickers.append(ticker)
                    ticker_articles.append(article)
                    
                    if article.id not in all_articles:
                        all_articles[article.id] = article
                    else:
                        # Add ticker to existing article's related_tickers
                        if ticker not in all_articles[article.id].related_tickers:
                            all_articles[article.id].related_tickers.append(ticker)

            # Cache this ticker's news
            if ticker_articles:
                cache_data = [art.model_dump(mode="json") for art in ticker_articles]
                await redis.set(
                    f"news:{ticker}",
                    json.dumps(cache_data, default=str),
                    ex=NEWS_CACHE_TTL
                )

    # Sort by date (newest first) and limit
    sorted_articles = sorted(
        all_articles.values(),
        key=lambda a: a.published_at,
        reverse=True
    )[:limit]

    return NewsFeedResponse(
        articles=sorted_articles,
        tickers_requested=tickers,
        total=len(sorted_articles)
    )


# Singleton instance
class NewsService:
    async def get_feed(self, tickers: List[str], limit: int = 30) -> NewsFeedResponse:
        return await get_news_for_tickers(tickers, limit)


news_service = NewsService()
