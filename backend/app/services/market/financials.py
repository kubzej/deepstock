"""
Historical financial data service.

Fetches annual income statement, balance sheet, and cash flow from yfinance
and computes historical multiples, profitability metrics, and growth rates.
Columns: FY years (up to 5) + LTM + FY N+1E + FY N+2E + 5Y Avg
"""
import json
import logging
import pandas as pd
import yfinance as yf
from typing import Optional

logger = logging.getLogger(__name__)

CACHE_TTL = 86400  # 24 hours


def _get(df: pd.DataFrame, keys: list[str], col) -> Optional[float]:
    for key in keys:
        if key in df.index:
            try:
                val = df.loc[key, col]
                if pd.notna(val):
                    return float(val)
            except Exception:
                continue
    return None


def _pct(value: Optional[float]) -> Optional[float]:
    """Store as decimal fraction (0.4391 = 43.91%)."""
    return round(value, 4) if value is not None else None


def _ratio(value: Optional[float]) -> Optional[float]:
    return round(value, 2) if value is not None else None


def _growth(current: Optional[float], previous: Optional[float]) -> Optional[float]:
    if current is None or previous is None or previous == 0:
        return None
    return round((current - previous) / abs(previous), 4)


def _avg_ratio(values: list, n: int) -> Optional[float]:
    """Average of first n non-null values, rounded to 2 decimal places."""
    valid = [v for v in values[:n] if v is not None]
    return round(sum(valid) / len(valid), 2) if valid else None


def _avg_pct(values: list, n: int) -> Optional[float]:
    """Average of first n non-null values, rounded to 4 decimal places."""
    valid = [v for v in values[:n] if v is not None]
    return round(sum(valid) / len(valid), 4) if valid else None


def _get_fwd(df, period_keys: list[str], col_name: str) -> Optional[float]:
    """Safely fetch a forward estimate value from an estimates DataFrame."""
    if df is None or df.empty:
        return None
    for period in period_keys:
        if period in df.index and col_name in df.columns:
            try:
                val = df.loc[period, col_name]
                if val is not None and pd.notna(val):
                    return float(val)
            except Exception:
                continue
    return None


async def get_historical_financials(redis, ticker: str) -> Optional[dict]:
    cache_key = f"historical_financials:{ticker}"

    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        income = t.income_stmt if hasattr(t, "income_stmt") else t.financials
        balance = t.balance_sheet
        cashflow = t.cashflow

        if income is None or income.empty:
            return None

        # Fallback shares from info (used only when income stmt doesn't have diluted shares)
        shares_fallback = info.get("sharesOutstanding")
        currency = info.get("currency", "USD")
        cols = sorted(income.columns)

        years: list[str] = []
        multiples:     dict[str, list] = {k: [] for k in ["pe", "peg", "pb", "ps", "pfcf", "ev_ebitda", "ev_revenue", "ev_fcf"]}
        yields_data:   dict[str, list] = {k: [] for k in ["earnings_yield", "fcf_yield", "dividend_yield"]}
        profitability: dict[str, list] = {k: [] for k in ["gross_margin", "operating_margin", "ebitda_margin", "net_margin", "fcf_margin", "roe", "roa", "roic"]}
        growth:        dict[str, list] = {k: [] for k in ["revenue_growth", "net_income_growth", "eps_growth", "ebitda_growth", "fcf_growth", "book_value_growth"]}
        health:        dict[str, list] = {k: [] for k in ["current_ratio"]}
        context:       dict[str, list] = {k: [] for k in ["revenue", "net_income", "free_cashflow", "market_cap", "enterprise_value", "price_at_fy"]}

        hist = t.history(period="6y")

        prev: dict[str, Optional[float]] = {
            "revenue": None, "net_income": None, "eps": None,
            "fcf": None, "ebitda": None, "bvps": None,
        }

        for col in cols:
            years.append(f"FY {col.year}")

            # ── Income statement ──────────────────────────────────────────
            revenue      = _get(income, ["Total Revenue"], col)
            gross_profit = _get(income, ["Gross Profit"], col)
            op_income    = _get(income, ["Operating Income", "EBIT"], col)
            ebitda       = _get(income, ["EBITDA", "Normalized EBITDA"], col)
            net_income   = _get(income, ["Net Income"], col)

            # Use diluted weighted-average shares from income stmt per year.
            # This correctly handles multi-class share structures (e.g. NU, GOOG).
            diluted_shares = _get(income, ["Diluted Average Shares", "Average Dilution Earnings"], col)
            basic_shares   = _get(income, ["Basic Average Shares", "Average Basic Shares"], col)
            shares = diluted_shares or basic_shares or shares_fallback

            # ── Balance sheet ─────────────────────────────────────────────
            b_col = col if (balance is not None and not balance.empty and col in balance.columns) else None
            total_assets       = _get(balance, ["Total Assets"], b_col) if b_col else None
            equity             = _get(balance, ["Stockholders Equity", "Common Stock Equity", "Total Stockholder Equity"], b_col) if b_col else None
            total_debt         = _get(balance, ["Total Debt", "Long Term Debt"], b_col) if b_col else None
            cash               = _get(balance, ["Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments"], b_col) if b_col else None
            current_assets     = _get(balance, ["Current Assets", "Total Current Assets"], b_col) if b_col else None
            current_liabilities = _get(balance, ["Current Liabilities", "Total Current Liabilities"], b_col) if b_col else None

            # ── Cash flow ─────────────────────────────────────────────────
            cf_col = col if (cashflow is not None and not cashflow.empty and col in cashflow.columns) else None
            fcf = _get(cashflow, ["Free Cash Flow"], cf_col) if cf_col else None
            dividends_paid_raw = _get(cashflow, ["Common Stock Dividend Paid", "Cash Dividends Paid", "Dividends Paid"], cf_col) if cf_col else None
            dividends_paid = abs(dividends_paid_raw) if dividends_paid_raw is not None else None

            # ── Price at FY end ───────────────────────────────────────────
            price_at_fy = None
            if not hist.empty:
                try:
                    hist_idx = hist.index
                    fy_ts = pd.Timestamp(col)
                    if hist_idx.tz is not None:
                        fy_ts = fy_ts.tz_localize(hist_idx.tz)
                    iloc = hist_idx.get_indexer([fy_ts], method="nearest")
                    if iloc[0] >= 0:
                        price_at_fy = float(hist.iloc[iloc[0]]["Close"])
                except Exception:
                    pass

            market_cap_fy = (price_at_fy * shares) if (price_at_fy and shares) else None
            ev_fy         = (market_cap_fy + (total_debt or 0) - (cash or 0)) if market_cap_fy else None
            eps           = (net_income / shares) if (net_income and shares) else None
            bvps          = (equity / shares) if (equity and shares) else None
            invested_cap  = (equity + (total_debt or 0)) if equity else None

            # ── Multiples ─────────────────────────────────────────────────
            multiples["pe"].append(_ratio((price_at_fy / eps) if (price_at_fy and eps and eps > 0) else None))
            multiples["peg"].append(None)  # PEG not meaningful for historical years
            multiples["pb"].append(_ratio((market_cap_fy / equity) if (market_cap_fy and equity and equity > 0) else None))
            multiples["ps"].append(_ratio((market_cap_fy / revenue) if (market_cap_fy and revenue and revenue > 0) else None))
            multiples["pfcf"].append(_ratio((market_cap_fy / fcf) if (market_cap_fy and fcf and fcf > 0) else None))
            multiples["ev_ebitda"].append(_ratio((ev_fy / ebitda) if (ev_fy and ebitda and ebitda > 0) else None))
            multiples["ev_revenue"].append(_ratio((ev_fy / revenue) if (ev_fy and revenue and revenue > 0) else None))
            multiples["ev_fcf"].append(_ratio((ev_fy / fcf) if (ev_fy and fcf and fcf > 0) else None))

            # ── Yields ────────────────────────────────────────────────────
            yields_data["earnings_yield"].append(_pct((net_income / market_cap_fy) if (net_income and market_cap_fy) else None))
            yields_data["fcf_yield"].append(_pct((fcf / market_cap_fy) if (fcf and market_cap_fy) else None))
            yields_data["dividend_yield"].append(_pct((dividends_paid / market_cap_fy) if (dividends_paid and market_cap_fy) else None))

            # ── Profitability ─────────────────────────────────────────────
            profitability["gross_margin"].append(_pct((gross_profit / revenue) if (gross_profit is not None and revenue) else None))
            profitability["operating_margin"].append(_pct((op_income / revenue) if (op_income is not None and revenue) else None))
            profitability["ebitda_margin"].append(_pct((ebitda / revenue) if (ebitda and revenue) else None))
            profitability["net_margin"].append(_pct((net_income / revenue) if (net_income is not None and revenue) else None))
            profitability["fcf_margin"].append(_pct((fcf / revenue) if (fcf and revenue) else None))
            profitability["roe"].append(_pct((net_income / equity) if (net_income is not None and equity and equity > 0) else None))
            profitability["roa"].append(_pct((net_income / total_assets) if (net_income is not None and total_assets) else None))
            profitability["roic"].append(_pct((net_income / invested_cap) if (net_income is not None and invested_cap and invested_cap > 0) else None))

            # ── Growth (YoY) ──────────────────────────────────────────────
            growth["revenue_growth"].append(_pct(_growth(revenue, prev["revenue"])))
            growth["net_income_growth"].append(_pct(_growth(net_income, prev["net_income"])))
            growth["eps_growth"].append(_pct(_growth(eps, prev["eps"])))
            growth["ebitda_growth"].append(_pct(_growth(ebitda, prev["ebitda"])))
            growth["fcf_growth"].append(_pct(_growth(fcf, prev["fcf"])))
            growth["book_value_growth"].append(_pct(_growth(bvps, prev["bvps"])))

            # ── Health ────────────────────────────────────────────────────
            health["current_ratio"].append(_ratio((current_assets / current_liabilities) if (current_assets and current_liabilities and current_liabilities > 0) else None))

            # ── Context ───────────────────────────────────────────────────
            context["revenue"].append(int(revenue) if revenue else None)
            context["net_income"].append(int(net_income) if net_income else None)
            context["free_cashflow"].append(int(fcf) if fcf else None)
            context["market_cap"].append(int(market_cap_fy) if market_cap_fy else None)
            context["enterprise_value"].append(int(ev_fy) if ev_fy else None)
            context["price_at_fy"].append(round(price_at_fy, 2) if price_at_fy else None)

            prev = {"revenue": revenue, "net_income": net_income, "eps": eps,
                    "fcf": fcf, "ebitda": ebitda, "bvps": bvps}

        n_fy = len(years)  # number of FY columns (used for 5Y avg)

        # ── LTM column (from current info) ───────────────────────────────
        ltm_revenue    = info.get("totalRevenue")
        ltm_fcf        = info.get("freeCashflow")
        ltm_market_cap = info.get("marketCap")
        ltm_ev         = info.get("enterpriseValue")
        ltm_price      = info.get("regularMarketPrice") or info.get("currentPrice")
        ltm_eps        = info.get("trailingEps")
        ltm_ebitda     = info.get("ebitda")
        ltm_book_value = info.get("bookValue")  # book value per share
        ltm_total_debt = info.get("totalDebt")
        ltm_net_income = info.get("netIncomeToCommon")

        # Derive total shares from market cap / price (includes all share classes)
        ltm_shares = (ltm_market_cap / ltm_price) if (ltm_market_cap and ltm_price and ltm_price > 0) else shares_fallback
        ltm_total_equity = (ltm_book_value * ltm_shares) if (ltm_book_value and ltm_shares) else None
        ltm_invested_cap = (ltm_total_equity + (ltm_total_debt or 0)) if ltm_total_equity else None
        ltm_bvps         = ltm_book_value

        years.append("LTM")

        multiples["pe"].append(_ratio(info.get("trailingPE")))
        multiples["peg"].append(_ratio(info.get("pegRatio")))
        multiples["pb"].append(_ratio(info.get("priceToBook")))
        # Compute P/S manually — priceToSalesTrailing12Months from yfinance can be unreliable
        multiples["ps"].append(_ratio((ltm_market_cap / ltm_revenue) if (ltm_market_cap and ltm_revenue and ltm_revenue > 0) else None))
        multiples["pfcf"].append(_ratio((ltm_market_cap / ltm_fcf) if (ltm_market_cap and ltm_fcf and ltm_fcf > 0) else None))
        multiples["ev_ebitda"].append(_ratio(info.get("enterpriseToEbitda")))
        multiples["ev_revenue"].append(_ratio((ltm_ev / ltm_revenue) if (ltm_ev and ltm_revenue and ltm_revenue > 0) else None))
        multiples["ev_fcf"].append(_ratio((ltm_ev / ltm_fcf) if (ltm_ev and ltm_fcf and ltm_fcf > 0) else None))

        yields_data["earnings_yield"].append(_pct((ltm_eps / ltm_price) if (ltm_eps and ltm_price and ltm_price > 0) else None))
        yields_data["fcf_yield"].append(_pct((ltm_fcf / ltm_market_cap) if (ltm_fcf and ltm_market_cap) else None))
        yields_data["dividend_yield"].append(_pct(info.get("dividendYield")))

        profitability["gross_margin"].append(_pct(info.get("grossMargins")))
        profitability["operating_margin"].append(_pct(info.get("operatingMargins")))
        profitability["ebitda_margin"].append(_pct((ltm_ebitda / ltm_revenue) if (ltm_ebitda and ltm_revenue) else None))
        profitability["net_margin"].append(_pct(info.get("profitMargins")))
        profitability["fcf_margin"].append(_pct((ltm_fcf / ltm_revenue) if (ltm_fcf and ltm_revenue) else None))
        profitability["roe"].append(_pct(info.get("returnOnEquity")))
        profitability["roa"].append(_pct(info.get("returnOnAssets")))
        profitability["roic"].append(_pct((ltm_net_income / ltm_invested_cap) if (ltm_net_income and ltm_invested_cap and ltm_invested_cap > 0) else None))

        growth["revenue_growth"].append(_pct(info.get("revenueGrowth")))
        growth["net_income_growth"].append(_pct(info.get("earningsGrowth")))
        growth["eps_growth"].append(_pct(_growth(ltm_eps, prev["eps"])))
        growth["ebitda_growth"].append(_pct(_growth(ltm_ebitda, prev["ebitda"])))
        growth["fcf_growth"].append(_pct(_growth(ltm_fcf, prev["fcf"])))
        growth["book_value_growth"].append(_pct(_growth(ltm_bvps, prev["bvps"])))

        health["current_ratio"].append(_ratio(info.get("currentRatio")))

        context["revenue"].append(int(ltm_revenue) if ltm_revenue else None)
        context["net_income"].append(int(ltm_net_income) if ltm_net_income else None)
        context["free_cashflow"].append(int(ltm_fcf) if ltm_fcf else None)
        context["market_cap"].append(int(ltm_market_cap) if ltm_market_cap else None)
        context["enterprise_value"].append(int(ltm_ev) if ltm_ev else None)
        context["price_at_fy"].append(round(ltm_price, 2) if ltm_price else None)

        # ── Forward Estimates columns (+1y and +2y analyst consensus) ────
        last_fy_year = cols[-1].year if cols else None

        earnings_est = None
        revenue_est  = None
        try:
            earnings_est = t.earnings_estimate
            revenue_est  = t.revenue_estimate
        except Exception:
            pass

        for fwd_offset, year_offset in ((1, 1),):
            period_keys = [f"+{fwd_offset}y", f"{fwd_offset}y"]
            fwd_label = f"FY {last_fy_year + year_offset}E" if last_fy_year else f"Fwd+{year_offset}"

            fwd_eps     = _get_fwd(earnings_est, period_keys, "avg")
            fwd_revenue = _get_fwd(revenue_est,  period_keys, "avg")

            fwd_pe         = _ratio((ltm_price / fwd_eps) if (ltm_price and fwd_eps and fwd_eps > 0) else None)
            fwd_ps         = _ratio((ltm_market_cap / fwd_revenue) if (ltm_market_cap and fwd_revenue and fwd_revenue > 0) else None)
            fwd_ev_revenue = _ratio((ltm_ev / fwd_revenue) if (ltm_ev and fwd_revenue and fwd_revenue > 0) else None)

            years.append(fwd_label)

            multiples["pe"].append(fwd_pe)
            multiples["peg"].append(None)
            multiples["pb"].append(None)
            multiples["ps"].append(fwd_ps)
            multiples["pfcf"].append(None)
            multiples["ev_ebitda"].append(None)
            multiples["ev_revenue"].append(fwd_ev_revenue)
            multiples["ev_fcf"].append(None)

            for key in yields_data:
                yields_data[key].append(None)

            # Net margin estimate if both net income and revenue are derivable
            fwd_net_income = (fwd_eps * ltm_shares) if (fwd_eps and ltm_shares) else None
            fwd_net_margin = _pct((fwd_net_income / fwd_revenue) if (fwd_net_income and fwd_revenue and fwd_revenue > 0) else None)
            profitability["gross_margin"].append(None)
            profitability["operating_margin"].append(None)
            profitability["ebitda_margin"].append(None)
            profitability["net_margin"].append(fwd_net_margin)
            profitability["fcf_margin"].append(None)
            profitability["roe"].append(None)
            profitability["roa"].append(None)
            profitability["roic"].append(None)

            growth["revenue_growth"].append(None)
            growth["net_income_growth"].append(None)
            growth["eps_growth"].append(_pct(_growth(fwd_eps, ltm_eps)))
            growth["ebitda_growth"].append(None)
            growth["fcf_growth"].append(None)
            growth["book_value_growth"].append(None)

            health["current_ratio"].append(None)

            context["revenue"].append(int(fwd_revenue) if fwd_revenue else None)
            context["net_income"].append(int(fwd_net_income) if fwd_net_income else None)
            context["free_cashflow"].append(None)
            context["market_cap"].append(int(ltm_market_cap) if ltm_market_cap else None)
            context["enterprise_value"].append(int(ltm_ev) if ltm_ev else None)
            context["price_at_fy"].append(round(ltm_price, 2) if ltm_price else None)

        # ── 5Y Avg column (average of FY columns only, not LTM/fwd) ──────
        years.append("5Y Avg")

        for key in multiples:
            multiples[key].append(_avg_ratio(multiples[key], n_fy))
        for key in yields_data:
            yields_data[key].append(_avg_pct(yields_data[key], n_fy))
        for key in profitability:
            profitability[key].append(_avg_pct(profitability[key], n_fy))
        for key in growth:
            growth[key].append(_avg_pct(growth[key], n_fy))
        for key in health:
            health[key].append(_avg_ratio(health[key], n_fy))
        for key in context:
            context[key].append(None)  # averages of absolute values don't make sense

        result = {
            "ticker": ticker,
            "currency": currency,
            "years": years,
            "multiples": multiples,
            "yields": yields_data,
            "profitability": profitability,
            "growth": growth,
            "health": health,
            "context": context,
        }

        await redis.setex(cache_key, CACHE_TTL, json.dumps(result))
        return result

    except Exception as e:
        logger.error(f"Error fetching historical financials for {ticker}: {e}", exc_info=True)
        return None
