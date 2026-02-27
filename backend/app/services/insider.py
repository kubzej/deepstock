"""
Insider trading service — fetches SEC Form 4 filings from EDGAR.

Strategy:
  1. Resolve ticker → CIK via SEC company_tickers.json (cached 7 days)
  2. Fetch recent Form 4 filing index for the CIK
  3. Parse each Form 4 XML for transaction details
  4. Cache parsed results in Redis (TTL 12 hours)

Only works for US-listed securities. Non-US tickers return empty list.
"""

import json
import logging
import xml.etree.ElementTree as ET
from datetime import date, timedelta

import httpx
import redis.asyncio as redis
from app.core.cache import CacheTTL

logger = logging.getLogger(__name__)

# SEC requires a descriptive User-Agent
SEC_USER_AGENT = "DeepStock/1.0 (kubzej8@gmail.com)"
SEC_BASE = "https://efts.sec.gov/LATEST"
EDGAR_BASE = "https://www.sec.gov"
EDGAR_DATA = "https://data.sec.gov"

# Cache TTLs — defined centrally in app.core.cache

# Transaction type codes from Form 4
TRANSACTION_CODES = {
    "P": "Purchase",
    "S": "Sale",
    "M": "Option Exercise",
    "G": "Gift",
    "A": "Award",
    "C": "Conversion",
    "F": "Tax Withholding",
    "J": "Other",
}


async def _get_cik_map(r: redis.Redis) -> dict[str, str]:
    """
    Fetch or return cached SEC CIK mapping (ticker → CIK string).

    Uses data.sec.gov/files/company_tickers.json which maps CIK → ticker.
    We invert it so we can look up by ticker.
    """
    cache_key = "sec:cik_map"
    cached = await r.get(cache_key)
    if cached:
        return json.loads(cached)

    url = f"{EDGAR_BASE}/files/company_tickers.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            url, headers={"User-Agent": SEC_USER_AGENT}, timeout=15
        )
        resp.raise_for_status()
        raw = resp.json()

    # raw is { "0": {"cik_str": 320193, "ticker": "AAPL", "title": "..."}, ... }
    cik_map: dict[str, str] = {}
    for entry in raw.values():
        ticker = entry.get("ticker", "").upper()
        cik = str(entry.get("cik_str", ""))
        if ticker and cik:
            cik_map[ticker] = cik

    await r.set(cache_key, json.dumps(cik_map), ex=CacheTTL.SEC_CIK_MAP)
    logger.info("Cached SEC CIK map (%d tickers)", len(cik_map))
    return cik_map


async def _resolve_cik(r: redis.Redis, ticker: str) -> str | None:
    """Resolve a ticker symbol to its SEC CIK number."""
    cik_map = await _get_cik_map(r)
    # Try exact match first
    clean = ticker.upper().split(".")[0]  # Strip exchange suffix (.DE, .L, etc.)
    return cik_map.get(clean)


async def _fetch_form4_index(
    cik: str, max_filings: int = 30
) -> list[dict]:
    """
    Fetch the list of recent Form 4 filings for a given CIK.

    Uses the EDGAR submissions API:
      https://data.sec.gov/submissions/CIK{cik}.json
    """
    padded_cik = cik.zfill(10)
    url = f"{EDGAR_DATA}/submissions/CIK{padded_cik}.json"

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            url, headers={"User-Agent": SEC_USER_AGENT}, timeout=15
        )
        resp.raise_for_status()
        data = resp.json()

    filings = data.get("filings", {}).get("recent", {})
    forms = filings.get("form", [])
    accession_numbers = filings.get("accessionNumber", [])
    filing_dates = filings.get("filingDate", [])
    primary_docs = filings.get("primaryDocument", [])

    results = []
    for i, form in enumerate(forms):
        if form != "4":
            continue
        if len(results) >= max_filings:
            break

        accession = accession_numbers[i].replace("-", "")
        results.append(
            {
                "accession": accession_numbers[i],
                "accession_nodash": accession,
                "filing_date": filing_dates[i],
                "primary_doc": primary_docs[i],
                "cik": cik,
            }
        )

    return results


def _parse_form4_xml(xml_text: str, filing_date: str, filing_url: str) -> list[dict]:
    """
    Parse a Form 4 XML document and extract transaction details.

    Returns a list of trade dicts (one filing can contain multiple transactions).
    """
    trades = []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        logger.warning("Failed to parse Form 4 XML")
        return trades

    # Issuer ticker
    ticker_el = root.find(".//issuerTradingSymbol")
    ticker = ticker_el.text.strip().upper() if ticker_el is not None and ticker_el.text else None

    # Reporting owner info
    owner_name_el = root.find(".//reportingOwner/reportingOwnerId/rptOwnerName")
    owner_name = owner_name_el.text.strip() if owner_name_el is not None and owner_name_el.text else "Unknown"

    title_el = root.find(
        ".//reportingOwner/reportingOwnerRelationship/officerTitle"
    )
    title = title_el.text.strip() if title_el is not None and title_el.text else None

    # If no officerTitle, check if they're a director, officer, or 10% owner
    if not title:
        rel = root.find(".//reportingOwner/reportingOwnerRelationship")
        if rel is not None:
            is_director = (rel.findtext("isDirector") or "").strip() == "1"
            is_officer = (rel.findtext("isOfficer") or "").strip() == "1"
            is_ten_pct = (rel.findtext("isTenPercentOwner") or "").strip() == "1"
            parts = []
            if is_officer:
                parts.append("Officer")
            if is_director:
                parts.append("Director")
            if is_ten_pct:
                parts.append("10%+ Owner")
            title = ", ".join(parts) if parts else None

    # Non-derivative transactions (common stock buys/sells)
    for tx in root.findall(".//nonDerivativeTransaction"):
        code_el = tx.find(".//transactionCoding/transactionCode")
        code = code_el.text.strip() if code_el is not None and code_el.text else "J"

        trade_type = TRANSACTION_CODES.get(code, "Other")

        # Transaction date
        tx_date_el = tx.find(".//transactionDate/value")
        trade_date = tx_date_el.text.strip() if tx_date_el is not None and tx_date_el.text else filing_date

        # Shares
        shares_el = tx.find(".//transactionAmounts/transactionShares/value")
        try:
            shares = int(float(shares_el.text.strip())) if shares_el is not None and shares_el.text else 0
        except (ValueError, TypeError):
            shares = 0

        # Price per share
        price_el = tx.find(
            ".//transactionAmounts/transactionPricePerShare/value"
        )
        try:
            price = float(price_el.text.strip()) if price_el is not None and price_el.text else None
        except (ValueError, TypeError):
            price = None

        # Shares owned after transaction
        owned_el = tx.find(
            ".//postTransactionAmounts/sharesOwnedFollowingTransaction/value"
        )
        try:
            owned_after = int(float(owned_el.text.strip())) if owned_el is not None and owned_el.text else None
        except (ValueError, TypeError):
            owned_after = None

        total_value = round(shares * price, 2) if (shares and price) else None

        trades.append(
            {
                "ticker": ticker,
                "filing_date": filing_date,
                "trade_date": trade_date,
                "insider_name": owner_name,
                "insider_title": title,
                "trade_type": trade_type,
                "shares": shares,
                "price_per_share": price,
                "total_value": total_value,
                "shares_owned_after": owned_after,
                "filing_url": filing_url,
            }
        )

    return trades


async def get_insider_trades(
    r: redis.Redis, ticker: str, months: int = 12
) -> list[dict]:
    """
    Get insider trades for a given ticker (US stocks only).

    Fetches from SEC EDGAR (Form 4), caches in Redis for 12 hours.
    Returns empty list for non-US tickers (no CIK found).
    """
    cache_key = f"insider:{ticker.upper()}"
    cached = await r.get(cache_key)
    if cached:
        return json.loads(cached)

    # Resolve CIK — if None, this is not a US stock
    cik = await _resolve_cik(r, ticker)
    if not cik:
        # Cache empty result briefly so we don't retry constantly
        await r.set(cache_key, "[]", ex=CacheTTL.NEGATIVE_CACHE)
        return []

    try:
        # Get filing index
        filings = await _fetch_form4_index(cik, max_filings=40)

        if not filings:
            await r.set(cache_key, "[]", ex=CacheTTL.INSIDER_TRADES)
            return []

        # Filter to last N months
        cutoff = (date.today() - timedelta(days=months * 30)).isoformat()
        filings = [f for f in filings if f["filing_date"] >= cutoff]

        # Fetch and parse each Form 4 XML (sequential to respect SEC rate limits)
        all_trades: list[dict] = []

        async with httpx.AsyncClient(
            headers={"User-Agent": SEC_USER_AGENT},
            timeout=15,
            follow_redirects=True,
        ) as client:
            for filing in filings:
                try:
                    # Strip XSL prefix (e.g. "xslF345X05/wk-form4_xxx.xml" → "wk-form4_xxx.xml")
                    raw_doc = filing["primary_doc"]
                    if "/" in raw_doc:
                        raw_doc = raw_doc.split("/", 1)[1]

                    doc_url = (
                        f"{EDGAR_BASE}/Archives/edgar/data/{cik}/"
                        f"{filing['accession_nodash']}/{raw_doc}"
                    )
                    filing_url = (
                        f"{EDGAR_BASE}/cgi-bin/browse-edgar?"
                        f"action=getcompany&CIK={cik}&type=4&dateb=&owner=include&count=1"
                    )

                    resp = await client.get(doc_url)
                    if resp.status_code != 200:
                        continue

                    trades = _parse_form4_xml(
                        resp.text, filing["filing_date"], filing_url
                    )

                    # Only keep Purchase and Sale (skip option exercises, gifts, etc.)
                    for t in trades:
                        if t["trade_type"] in ("Purchase", "Sale") and t["shares"] > 0:
                            all_trades.append(t)

                except Exception as e:
                    logger.warning("Error parsing filing %s: %s", filing["accession"], e)
                    continue

        # Sort by trade date descending
        all_trades.sort(key=lambda t: t["trade_date"], reverse=True)

        # Cache
        await r.set(cache_key, json.dumps(all_trades, default=str), ex=CacheTTL.INSIDER_TRADES)
        logger.info(
            "Cached %d insider trades for %s", len(all_trades), ticker.upper()
        )
        return all_trades

    except Exception as e:
        logger.error("Failed to fetch insider trades for %s: %s", ticker, e)
        return []
