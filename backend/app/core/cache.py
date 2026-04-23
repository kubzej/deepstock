"""
Centralized Redis cache TTL configuration.

All cache expiration times are defined here to ensure consistency
across all services and to make tuning easy.

Strategy:
- Market data (prices): Short TTL - changes every second during trading
- Research data: Medium TTL - fundamentals update daily/quarterly
- User-specific analytics: 1 hour - expensive to compute
- External slow data: Long TTL - SEC filings, CIK maps
- Dedup / flag keys: 24 hours - prevent double-sending alerts
"""


class CacheTTL:
    # ── Market data ───────────────────────────────────────────────
    QUOTE_BASIC = 300               # 5 min  — price, change, volume
    QUOTE_EXTENDED = 14400          # 4 hours — pre/post market, earnings date
    OPTION_QUOTE = 300               # 5 min  — aligned with frontend staleTime
    PRICE_HISTORY_INTRADAY = 60     # 1 min  — 1d / 5d charts
    PRICE_HISTORY_SHORT = 14400     # 4 hours — 1mo / 3mo charts
    PRICE_HISTORY_LONG = 86400      # 24 hours — 6mo+ charts

    # ── Research ──────────────────────────────────────────────────
    STOCK_INFO = 1800               # 30 min — fundamentals + valuation (data mění se max. kvartálně)
    TECHNICAL_RAW = 3600            # 1 hour — 2y raw OHLCV + computed indicators
    TECHNICAL_SIGNALS = 300         # 5 min  — filtered signals per period

    # ── External / slow-changing data ────────────────────────────
    EXCHANGE_RATES = 3600           # 1 hour — CZK rates from ECB
    INSIDER_TRADES = 43200          # 12 hours — SEC Form 4 filings
    SEC_CIK_MAP = 604800            # 7 days  — ticker → CIK mapping (static)

    # ── User analytics ────────────────────────────────────────────
    PERFORMANCE = 3600              # 1 hour — portfolio performance charts

    # ── Dedup / flag keys ─────────────────────────────────────────
    ALERT_SENT = 86400              # 24 hours — prevent duplicate alert sends

    # ── AI Research reports ───────────────────────────────────────
    AI_RESEARCH_REPORT = 86400      # 24 hours — AI-generated research reports (fundamental)
    AI_TA_REPORT = 7200             # 2 hours  — AI technical analysis (TA changes faster)

    # ── External sentiment data ────────────────────────────────────
    FEAR_GREED = 1800               # 30 min  — CNN Fear & Greed Index

    # ── Negative cache (not-found results) ────────────────────────
    NEGATIVE_CACHE = 3600           # 1 hour — cache "not found" to avoid hammering APIs
