"""
AI Research Service — orchestrates data gathering + LLM report generation.

Flow:
1. Check Redis cache (24h TTL)
2. Fetch yfinance fundamentals + valuation context
3. Run parallel Tavily web searches
4. Build prompt from template
5. Call LLM via litellm_client
6. Cache result and return
"""
import json
import logging
import asyncio
from datetime import date, datetime
from typing import Literal, Optional

from app.core.redis import get_redis
from app.core.cache import CacheTTL
from app.ai.providers.litellm_client import call_llm
from app.ai.search import tavily_client
from app.ai.prompts import briefing_prompt, full_analysis_prompt

logger = logging.getLogger(__name__)

ReportType = Literal["briefing", "full_analysis"]


# ─── Context builders ──────────────────────────────────────────────────────────

def _format_fundamentals(stock_data: dict) -> str:
    """Convert yfinance stock_info dict into readable context for the prompt."""
    name = stock_data.get("name", "N/A")
    sector = stock_data.get("sector", "N/A")
    industry = stock_data.get("industry", "N/A")

    def pct(v): return f"{v*100:.1f}%" if v is not None else "N/A"
    def num(v, d=2): return f"{v:,.{d}f}" if v is not None else "N/A"
    def bil(v): return f"${v/1e9:.1f}B" if v is not None else "N/A"

    price = stock_data.get("price")
    target_mean = stock_data.get("targetMeanPrice")
    upside = ((target_mean - price) / price * 100) if (target_mean and price) else None

    valuation = stock_data.get("valuation", {})
    composite = valuation.get("composite", {})

    lines = [
        f"**Společnost:** {name} ({stock_data.get('symbol')})",
        f"**Sektor:** {sector} | **Odvětví:** {industry}",
        f"**Burza:** {stock_data.get('exchange')} | **Měna:** {stock_data.get('currency')}",
        "",
        "### Cena a trh",
        f"- Aktuální cena: {num(price)} USD",
        f"- 52W High: {num(stock_data.get('fiftyTwoWeekHigh'))} | 52W Low: {num(stock_data.get('fiftyTwoWeekLow'))}",
        f"- Market Cap: {bil(stock_data.get('marketCap'))}",
        f"- Beta: {num(stock_data.get('beta'))}",
        "",
        "### Valuace",
        f"- P/E (TTM): {num(stock_data.get('trailingPE'))} | Forward P/E: {num(stock_data.get('forwardPE'))}",
        f"- P/B: {num(stock_data.get('priceToBook'))} | P/S: {num(stock_data.get('priceToSales'))}",
        f"- PEG: {num(stock_data.get('pegRatio'))} | EV/EBITDA: {num(stock_data.get('enterpriseToEbitda'))}",
        "",
        "### Fundamenty",
        f"- Tržby: {bil(stock_data.get('revenue'))} | Růst tržeb: {pct(stock_data.get('revenueGrowth'))}",
        f"- Hrubá marže: {pct(stock_data.get('grossMargin'))} | Provozní marže: {pct(stock_data.get('operatingMargin'))}",
        f"- Čistá marže: {pct(stock_data.get('profitMargin'))}",
        f"- EPS (TTM): {num(stock_data.get('eps'))} | Forward EPS: {num(stock_data.get('forwardEps'))}",
        f"- Růst zisků: {pct(stock_data.get('earningsGrowth'))}",
        f"- ROE: {pct(stock_data.get('roe'))} | ROA: {pct(stock_data.get('roa'))}",
        f"- Debt/Equity: {num(stock_data.get('debtToEquity'))} | Current Ratio: {num(stock_data.get('currentRatio'))}",
        f"- Free Cash Flow: {bil(stock_data.get('freeCashflow'))}",
        "",
        "### Dividendy",
        f"- Dividendový výnos: {pct(stock_data.get('dividendYield'))} | Roční dividenda: {num(stock_data.get('dividendRate'))} USD",
        f"- Payout Ratio: {pct(stock_data.get('payoutRatio'))}",
        "",
        "### Analytici (yfinance konsenzus)",
        f"- Doporučení: {stock_data.get('recommendationKey', 'N/A').upper()}",
        f"- Počet analytiků: {stock_data.get('numberOfAnalystOpinions', 'N/A')}",
        f"- Price target: průměr {num(target_mean)} USD | low {num(stock_data.get('targetLowPrice'))} | high {num(stock_data.get('targetHighPrice'))} USD",
    ]

    if upside is not None:
        direction = "nahoru" if upside > 0 else "dolů"
        lines.append(f"- Potenciál {direction}: {abs(upside):.1f}% od aktuální ceny")

    # Add composite valuation signal if available
    if composite:
        signal = composite.get("signal", "N/A")
        composite_price = composite.get("fairValue")
        lines += [
            "",
            "### Interní valuační modely (systémový výpočet)",
            f"- Kompozitní fair value: {num(composite_price)} USD",
            f"- Signál: {signal}",
        ]

    # Add key insights — insights is a list of {type, title, description}
    insights = stock_data.get("insights", [])
    warnings = [i for i in insights if i.get("type") == "warning"]
    positives = [i for i in insights if i.get("type") == "positive"]
    if warnings:
        lines += ["", "### Varování (rule-based systém)"]
        for w in warnings[:5]:
            lines.append(f"- ⚠ {w.get('title', '')}: {w.get('description', '')}")
    if positives:
        lines += ["", "### Pozitiva (rule-based systém)"]
        for p in positives[:5]:
            lines.append(f"- ✓ {p.get('title', '')}: {p.get('description', '')}")

    return "\n".join(lines)


def _build_search_queries(ticker: str, company_name: str, report_type: ReportType) -> list[tuple[str, int]]:
    """
    Return list of (query, days_back) tuples to search.
    Days_back limits Tavily to recent results.
    """
    short_name = company_name.split()[0] if company_name else ticker
    year = date.today().year

    queries = [
        (f"{short_name} {ticker} earnings results quarterly revenue", 90),
        (f"{short_name} analyst report price target upgrade downgrade {year}", 60),
        (f"{ticker} {short_name} stock news latest", 30),
        (f"{ticker} CEO guidance outlook forecast {year}", 60),
        (f"{ticker} reddit investors discussion sentiment", 30),
    ]

    if report_type == "full_analysis":
        queries += [
            (f"{short_name} competitive advantage market share moat", 180),
            (f"{short_name} risks challenges headwinds {year}", 60),
            (f"{short_name} business model revenue streams growth", 180),
        ]

    return queries


# ─── Main service ──────────────────────────────────────────────────────────────

async def generate_research_report(
    ticker: str,
    current_price: float,
    report_type: ReportType,
    stock_data: dict,
    force_refresh: bool = False,
) -> dict:
    """
    Generate an AI research report for the given ticker.

    Args:
        ticker: Stock symbol (e.g. "AAPL")
        current_price: Current market price
        report_type: "briefing" or "full_analysis"
        stock_data: Already-fetched yfinance data dict from stock_info service
        force_refresh: Skip cache and regenerate

    Returns dict with keys: markdown, ticker, report_type, generated_at, model_used, cached
    """
    today = date.today().isoformat()
    cache_key = f"ai_research:{ticker}:{report_type}:{today}"

    redis = get_redis()

    # Check cache
    if not force_refresh:
        cached = await redis.get(cache_key)
        if cached:
            logger.info(f"Cache hit for {cache_key}")
            result = json.loads(cached)
            result["cached"] = True
            return result

    logger.info(f"Generating {report_type} report for {ticker} at ${current_price}")

    company_name = stock_data.get("name") or ticker
    fundamentals_context = _format_fundamentals(stock_data)

    # Run all web searches in parallel
    queries = _build_search_queries(ticker, company_name, report_type)
    search_tasks = [tavily_client.search(query, max_results=4, days=days) for query, days in queries]
    search_results_list = await asyncio.gather(*search_tasks, return_exceptions=True)

    # Combine all search results into one context block
    all_results = []
    for i, (query, _) in enumerate(queries):
        results = search_results_list[i]
        if isinstance(results, Exception):
            logger.warning(f"Search failed for '{query}': {results}")
            continue
        if results:
            all_results.append(f"### Výsledky hledání: \"{query}\"\n\n{tavily_client.format_results(results)}")

    search_context = ("\n\n" + "=" * 60 + "\n\n").join(all_results) if all_results else "Web search nedostupný."

    # Build prompt
    prompt_date = datetime.now().strftime("%-d. %-m. %Y")

    if report_type == "briefing":
        system = briefing_prompt.SYSTEM_PROMPT
        user = briefing_prompt.build_user_prompt(
            ticker=ticker,
            company_name=company_name,
            current_price=current_price,
            date=prompt_date,
            fundamentals_context=fundamentals_context,
            search_context=search_context,
        )
    else:
        system = full_analysis_prompt.SYSTEM_PROMPT
        user = full_analysis_prompt.build_user_prompt(
            ticker=ticker,
            company_name=company_name,
            current_price=current_price,
            date=prompt_date,
            fundamentals_context=fundamentals_context,
            search_context=search_context,
        )

    # Call LLM
    markdown_content, model_used = await call_llm(system, user)

    # Append sources section from Tavily results
    source_items = []
    seen_urls = set()
    for results in search_results_list:
        if isinstance(results, Exception) or not results:
            continue
        for r in results:
            url = r.get("url", "")
            title = r.get("title", url)
            if url and url not in seen_urls:
                seen_urls.add(url)
                source_items.append(f"- [{title}]({url})")
    if source_items:
        markdown_content += "\n\n---\n\n## Zdroje\n\n" + "\n".join(source_items)

    result = {
        "markdown": markdown_content,
        "ticker": ticker,
        "company_name": company_name,
        "report_type": report_type,
        "current_price": current_price,
        "generated_at": datetime.now().isoformat(),
        "model_used": model_used,
        "cached": False,
    }

    # Cache for 24 hours
    await redis.set(cache_key, json.dumps(result), ex=CacheTTL.AI_RESEARCH_REPORT)
    logger.info(f"Report cached at {cache_key}")

    return result
