"""
Tavily search client — web search optimized for AI agents.

Requires: TAVILY_API_KEY env var
Free tier: 1000 requests/month (sufficient for personal quarterly research)
"""
import os
import logging
import asyncio
from typing import Optional
from tavily import TavilyClient

logger = logging.getLogger(__name__)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

_client: Optional[TavilyClient] = None


def _get_client() -> TavilyClient:
    global _client
    if _client is None:
        if not TAVILY_API_KEY:
            raise ValueError("TAVILY_API_KEY environment variable is not set")
        _client = TavilyClient(api_key=TAVILY_API_KEY)
    return _client


# Prioritize reliable financial sources over random blogs
FINANCIAL_DOMAINS = [
    "reuters.com",
    "bloomberg.com",
    "wsj.com",
    "ft.com",
    "cnbc.com",
    "seekingalpha.com",
    "fool.com",
    "marketwatch.com",
    "businesswire.com",   # Official press releases
    "prnewswire.com",     # Official press releases
    "ir.nubank.com",      # IR pages (generic placeholder)
    "sec.gov",            # SEC filings
    "finance.yahoo.com",
]


SEARCH_TIMEOUT = 30  # seconds per individual search query


async def search(
    query: str, max_results: int = 5, days: int = 30, include_raw_content: bool = False
) -> list[dict]:
    """
    Search the web for the given query.
    Returns list of {title, url, content} dicts (plus raw_content when requested).
    Runs synchronous Tavily client in thread pool to avoid blocking.
    Times out after SEARCH_TIMEOUT seconds to prevent hanging requests.

    include_raw_content: by default Tavily's `content` field is a short
    AI-generated snippet — fine for news, but for something like an earnings
    call transcript page it often only covers the opening (participant list)
    and never reaches the actual Q&A. Set this when the query specifically
    targets long-form content you need the substance of, not just a snippet.
    """
    def _sync_search():
        client = _get_client()
        result = client.search(
            query=query,
            max_results=max_results,
            search_depth="advanced",
            include_raw_content=include_raw_content,
            days=days,
            include_domains=FINANCIAL_DOMAINS,
        )
        # If no results from trusted domains, retry without domain filter (basic = faster fallback)
        if not result.get("results"):
            result = client.search(
                query=query,
                max_results=max_results,
                search_depth="basic",
                include_raw_content=include_raw_content,
                days=days,
            )
        return result.get("results", [])

    try:
        loop = asyncio.get_event_loop()
        results = await asyncio.wait_for(
            loop.run_in_executor(None, _sync_search),
            timeout=SEARCH_TIMEOUT,
        )
        logger.info(f"Tavily search '{query[:50]}...' returned {len(results)} results")
        return results
    except asyncio.TimeoutError:
        logger.warning(f"Tavily search timed out after {SEARCH_TIMEOUT}s for '{query[:50]}'")
        return []
    except Exception as e:
        msg = str(e).lower()
        if "usage limit" in msg or "quota" in msg or "limit exceeded" in msg or "402" in msg:
            logger.warning(f"Tavily usage limit reached: {e}")
            raise ValueError("Překročen měsíční limit Tavily (1000 requestů/měsíc). Zkontroluj app.tavily.com.")
        logger.error(f"Tavily search failed for '{query}': {e}")
        return []


def format_results(results: list[dict], raw_content_chars: int = 6000) -> str:
    """Format Tavily results into readable text block for prompt context.

    Prefers raw_content (full scraped page, truncated) when the search was run
    with include_raw_content=True; falls back to the short content snippet
    otherwise — same as before for every caller that didn't ask for raw content.
    """
    if not results:
        return "Žádné výsledky nenalezeny."

    parts = []
    for i, r in enumerate(results, 1):
        title = r.get("title", "Bez názvu")
        url = r.get("url", "")
        raw = (r.get("raw_content") or "").strip()
        if raw:
            content = raw[:raw_content_chars]
            if len(raw) > raw_content_chars:
                content += "…"
        else:
            content = r.get("content", "").strip()
        parts.append(f"[{i}] {title}\nURL: {url}\n{content}")

    return "\n\n---\n\n".join(parts)
