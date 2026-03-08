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
from app.ai.prompts import briefing_prompt, full_analysis_prompt, technical_prompt
from app.services.insider import get_insider_trades
from app.services.market import market_service

logger = logging.getLogger(__name__)

ReportType = Literal["briefing", "full_analysis", "technical_analysis"]


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
            lines.append(f"- [riziko] {w.get('title', '')}: {w.get('description', '')}")
    if positives:
        lines += ["", "### Pozitiva (rule-based systém)"]
        for p in positives[:5]:
            lines.append(f"- [+] {p.get('title', '')}: {p.get('description', '')}")

    return "\n".join(lines)


def _format_insider_trades(trades: list[dict], months: int = 6) -> str:
    """Format recent insider trades for AI context."""
    if not trades:
        return "Insider data nedostupná (non-US ticker nebo žádné transakce v EDGAR)."

    from datetime import timedelta
    cutoff = (date.today() - timedelta(days=months * 30)).isoformat()
    recent = [t for t in trades if t.get("trade_date", "") >= cutoff]

    if not recent:
        return f"Žádné insider nákupy/prodeje v posledních {months} měsících."

    buys = [t for t in recent if t["trade_type"] == "Purchase"]
    sells = [t for t in recent if t["trade_type"] == "Sale"]

    buy_total = sum(t["total_value"] for t in buys if t.get("total_value"))
    sell_total = sum(t["total_value"] for t in sells if t.get("total_value"))

    def fmt_val(v: float) -> str:
        if v >= 1_000_000:
            return f"${v / 1_000_000:.1f}M"
        return f"${v / 1_000:.0f}K"

    lines = [
        f"Nákupy: {len(buys)} transakcí, celkem {fmt_val(buy_total) if buy_total else 'N/A'}",
        f"Prodeje: {len(sells)} transakcí, celkem {fmt_val(sell_total) if sell_total else 'N/A'}",
        "",
        "Posledních 8 transakcí (pouze Purchase / Sale):",
    ]
    for t in recent[:8]:
        val = fmt_val(t["total_value"]) if t.get("total_value") else "N/A"
        lines.append(
            f"- {t['trade_date']} | {t['insider_name']} ({t.get('insider_title', '?')}) "
            f"| {t['trade_type']} | {t['shares']:,} akcií | {val}"
        )

    return "\n".join(lines)


def _format_ta_context(ta: dict) -> str:
    """
    Format technical indicator data into a compact AI-readable context.
    Includes current values + derived trajectories. Never sends raw history arrays.
    """
    def f(v, d=2): return f"{v:.{d}f}" if v is not None else "N/A"
    def pct(v): return f"{v:+.1f}%" if v is not None else "N/A"

    # ── Trajectory helpers ──────────────────────────────────────────────────────
    # RSI trajectory: 30D → 14D → now
    rsi_hist = ta.get("rsiHistory", [])
    if len(rsi_hist) >= 30:
        rsi_30d = rsi_hist[-30].get("rsi")
        rsi_14d = rsi_hist[-14].get("rsi")
        rsi_traj = f"  Trajektorie: {f(rsi_30d, 1)} → {f(rsi_14d, 1)} → {f(ta.get('rsi14'), 1)}"
    else:
        rsi_traj = ""

    # MACD: days since histogram last crossed zero
    macd_hist = ta.get("macdHistory", [])
    days_cross = None
    if macd_hist:
        cur_sign = macd_hist[-1].get("histogram", 0) >= 0
        for i in range(len(macd_hist) - 2, max(len(macd_hist) - 60, -1), -1):
            if (macd_hist[i].get("histogram", 0) >= 0) != cur_sign:
                days_cross = len(macd_hist) - 1 - i
                break
    macd_cross_str = f"  Crossover: {days_cross} dní zpátky" if days_cross is not None else ""

    # Bollinger position trajectory: 14D ago vs now
    bb_hist = ta.get("bollingerHistory", [])
    bb_pos_str = ""
    if len(bb_hist) >= 14:
        price_14d = bb_hist[-14].get("price")
        bb_upper_14d = bb_hist[-14].get("upper")
        bb_lower_14d = bb_hist[-14].get("lower")
        if price_14d and bb_upper_14d and bb_lower_14d and (bb_upper_14d - bb_lower_14d) > 0:
            bb_pos_14d = round(((price_14d - bb_lower_14d) / (bb_upper_14d - bb_lower_14d)) * 100, 1)
            bb_pos_str = f"  14D zpátky: {bb_pos_14d}/100"

    # Days price has been above/below SMA50 and SMA200
    ph = ta.get("priceHistory", [])
    days_above_sma50, days_above_sma200 = None, None
    if ph:
        for i in range(len(ph) - 1, max(len(ph) - 120, -1), -1):
            row = ph[i]
            p, s50, s200 = row.get("price"), row.get("sma50"), row.get("sma200")
            if days_above_sma50 is None and p and s50:
                if (ta.get("priceVsSma50", 0) or 0) >= 0:
                    if p < s50:
                        days_above_sma50 = len(ph) - 1 - i
                        break
                else:
                    if p >= s50:
                        days_above_sma50 = len(ph) - 1 - i
                        break
        for i in range(len(ph) - 1, max(len(ph) - 250, -1), -1):
            row = ph[i]
            p, s200 = row.get("price"), row.get("sma200")
            if p and s200:
                if (ta.get("priceVsSma200", 0) or 0) >= 0:
                    if p < s200:
                        days_above_sma200 = len(ph) - 1 - i
                        break
                else:
                    if p >= s200:
                        days_above_sma200 = len(ph) - 1 - i
                        break

    sma50_dur = f" ({days_above_sma50}D)" if days_above_sma50 is not None else ""
    sma200_dur = f" ({days_above_sma200}D)" if days_above_sma200 is not None else ""

    # ── Fibonacci key levels ────────────────────────────────────────────────────
    fib = ta.get("fibonacciLevels", {})
    fib_lines = []
    level_names = {"0": "0%", "236": "23.6%", "382": "38.2%", "500": "50%",
                   "618": "61.8%", "786": "78.6%", "1000": "100%"}
    for k, name in level_names.items():
        v = fib.get(k) or fib.get(int(k))
        if v:
            fib_lines.append(f"  {name}: ${f(v)}")

    fib_str = "\n".join(fib_lines) if fib_lines else "  N/A"
    period_high = ta.get("periodHigh")
    period_low = ta.get("periodLow")
    nearest = ta.get("nearestFibLevel", "")

    lines = [
        "### Trend",
        f"- Cena vs SMA50: {pct(ta.get('priceVsSma50'))}{sma50_dur} | Cena vs SMA200: {pct(ta.get('priceVsSma200'))}{sma200_dur}",
        f"- ADX: {f(ta.get('adx'), 1)} [{ta.get('adxSignal', 'N/A')}] | +DI: {f(ta.get('plusDI'), 1)} | -DI: {f(ta.get('minusDI'), 1)} | {ta.get('adxTrend', '')}",
        f"- Signál trendu: {ta.get('trendSignal', 'N/A')} — {ta.get('trendDescription', '')}",
        "",
        "### Momentum",
        f"- RSI 14: {f(ta.get('rsi14'), 1)} [{ta.get('rsiSignal') or 'N/A'}]",
    ]
    if rsi_traj:
        lines.append(rsi_traj)
    lines += [
        f"- MACD: {f(ta.get('macd'))} | Signal: {f(ta.get('macdSignal'))} | Histogram: {f(ta.get('macdHistogram'))} [{ta.get('macdTrend', 'N/A')}]",
    ]
    if macd_cross_str:
        lines.append(macd_cross_str)
    lines += [
        f"- Stochastik K: {f(ta.get('stochasticK'), 1)} | D: {f(ta.get('stochasticD'), 1)} [{ta.get('stochasticSignal', 'N/A')}]",
        "",
        "### Volatilita a pásma",
        f"- Bollinger position: {ta.get('bollingerPosition', 'N/A')}/100 [{ta.get('bollingerSignal', 'N/A')}]",
        f"  Pásmo: ${f(ta.get('bollingerLower'))} – ${f(ta.get('bollingerUpper'))} (střed ${f(ta.get('bollingerMiddle'))})",
    ]
    if bb_pos_str:
        lines.append(bb_pos_str)
    lines += [
        f"- ATR 14: {f(ta.get('atr14'))} ({f(ta.get('atrPercent'))}%) [{ta.get('atrSignal', 'N/A')}]",
        "",
        "### Objem",
        f"- Objem vs 20D průměr: {pct(ta.get('volumeChange'))} [{ta.get('volumeSignal', 'N/A')}]",
        f"- OBV trend: {ta.get('obvTrend', 'N/A')} | OBV divergence: {ta.get('obvDivergence', 'N/A')}",
        "",
        "### Fibonacci retracement",
        f"- Období: high ${f(period_high)} | low ${f(period_low)} | Nejbližší level: {nearest}",
        fib_str,
    ]

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
        (f"Federal Reserve interest rates S&P 500 stock market outlook {year}", 30),
    ]

    queries += [
        (f"{short_name} {ticker} vs competitors peer comparison valuation {year}", 90),
    ]

    if report_type == "full_analysis":
        queries += [
            (f"{short_name} competitive advantage market share moat", 180),
            (f"{short_name} risks challenges headwinds {year}", 60),
            (f"{short_name} business model revenue streams growth", 180),
            (f"{short_name} capital allocation buybacks acquisitions dividends {year}", 90),
        ]

    return queries


# ─── Main service ──────────────────────────────────────────────────────────────

async def generate_research_report(
    ticker: str,
    current_price: float,
    report_type: ReportType,
    stock_data: dict,
    force_refresh: bool = False,
    period: str = "3mo",
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
    # For technical_analysis include period in cache key (different period = different report)
    cache_suffix = f":{period}" if report_type == "technical_analysis" else ""
    cache_key = f"ai_research:{ticker}:{report_type}:{today}{cache_suffix}"

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
    prompt_date = datetime.now().strftime("%-d. %-m. %Y")

    # ── Technical analysis: skip Tavily + insider, use TA data directly ─────────
    if report_type == "technical_analysis":
        ta_data = await market_service.get_technical_indicators(ticker, period=period)
        if not ta_data:
            raise ValueError(f"Technická data pro {ticker} nejsou dostupná.")

        ta_context = _format_ta_context(ta_data)
        system = technical_prompt.SYSTEM_PROMPT
        user = technical_prompt.build_user_prompt(
            ticker=ticker,
            company_name=company_name,
            current_price=current_price,
            date=prompt_date,
            period=period,
            ta_context=ta_context,
        )
        markdown_content, model_used = await call_llm(system, user)

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
        await redis.set(cache_key, json.dumps(result), ex=CacheTTL.AI_TA_REPORT)
        logger.info(f"TA report cached at {cache_key}")
        return result

    # ── Fundamental reports (briefing / full_analysis) ───────────────────────────
    fundamentals_context = _format_fundamentals(stock_data)

    # Run web searches + insider fetch in parallel
    queries = _build_search_queries(ticker, company_name, report_type)
    search_tasks = [tavily_client.search(query, max_results=4, days=days) for query, days in queries]
    insider_months = 6 if report_type == "full_analysis" else 3
    all_tasks = [*search_tasks, get_insider_trades(redis, ticker, months=insider_months)]
    all_results = await asyncio.gather(*all_tasks, return_exceptions=True)
    search_results_list = all_results[:-1]
    insider_result = all_results[-1]
    insider_trades = [] if isinstance(insider_result, Exception) else (insider_result or [])
    insider_context = _format_insider_trades(insider_trades, months=insider_months)

    # Combine all search results into one context block
    search_text_parts = []
    for i, (query, _) in enumerate(queries):
        results = search_results_list[i]
        if isinstance(results, Exception):
            logger.warning(f"Search failed for '{query}': {results}")
            continue
        if results:
            search_text_parts.append(f"### Výsledky hledání: \"{query}\"\n\n{tavily_client.format_results(results)}")

    search_context = ("\n\n" + "=" * 60 + "\n\n").join(search_text_parts) if search_text_parts else "Web search nedostupný."

    if report_type == "briefing":
        system = briefing_prompt.SYSTEM_PROMPT
        user = briefing_prompt.build_user_prompt(
            ticker=ticker,
            company_name=company_name,
            current_price=current_price,
            date=prompt_date,
            fundamentals_context=fundamentals_context,
            search_context=search_context,
            insider_context=insider_context,
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
            insider_context=insider_context,
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
