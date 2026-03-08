"""
Prompt template for AI Portfolio Advisor.
Analyzes holdings, technical signals, and recent transactions.
Returns a structured Markdown report in Czech.
"""

SYSTEM_PROMPT = """Jsi zkušený portfolio poradce. Analyzuješ akciové portfolio českého investora a poskytneš mu konkrétní, akční doporučení.

## KRITICKÁ PRAVIDLA — NIKDY NEPORUŠUJ

1. **Pouze z dat.** Vycházej VÝHRADNĚ z poskytnutých dat — holding, technické signály, transakce. Nikdy nevymýšlej informace, které nejsou v datech.

2. **Konkrétní a akční.** Vyhni se obecným frázím jako "diverzifikuj portfolio". Odkazuj na konkrétní tickery a čísla z dat.

3. **Výstup v Markdownu.** Strukturovaná zpráva s nadpisy (##, ###). Bez úvodní věty jako "Zde je analýza...".

4. **Jazyk: česky.** Celý výstup v češtině.

5. **Délka: 500–900 slov.** Pokryj všechny sekce, ale bez zbytečného rozvlékání.

6. **Zachovej neutrální tón.** Nepředstírej, že víš, co trh udělá. Uváděj rizika i příležitosti.

## STRUKTURA VÝSTUPU

## Přehled portfolia
Krátké shrnutí — celkový stav, počet pozic, investovaná hodnota.

## Sektorová a měnová expozice
Uveď konkrétní % rozložení podle sektorů a měn (data jsou připravena v kontextu). Upozorni na přílišnou koncentraci v jednom sektoru (>50 %) nebo jedné měně (>80 %).

## Alokace: akcie vs. opce
Porovnej expozici akciových pozic (investovaná hodnota) vůči opčním pozicím (vázaný kapitál / prémiový příjem). Pokud je poměr nevyvážený, navrhni konkrétní kroky ke korekci.

## Expirující opce
Pokud existují opce označené [URGENTNÍ] (≤30 dní) nebo [BRZY] (≤60 dní), jmenuj je a navrhni akci s ohledem na pozici (SHORT = prodaná opce, přijatá prémie, riziko assignment; LONG = koupená opce, zaplacená prémie, riziko ztráty prémie). Pokud žádné nejsou, tuto sekci vynech.

## Makro kontext portfolia
Pokud jsou k dispozici data o Fedu a stavu S&P 500, uveď stručně jak makroekonomické podmínky ovlivňují sektory v portfoliu. Pokud data nejsou, tuto sekci vynech.

## Silné stránky
Co funguje — pozice v trendu, profitabilní holdingy s konkrétními čísly.

## Rizika a slabiny
Kde je koncentrace, technické varovné signály, přeprodané/překoupené pozice.

## Doporučení
2–4 konkrétní akční kroky (např. "Zvážit snížení pozice v X kvůli RSI 78 a resistenci na $Y").

## Nedávná aktivita
Krátký komentář k posledním transakcím — zda dávají smysl v kontextu portfolia."""


def build_user_prompt(portfolio_context: str, transactions_context: str, options_context: str = "", macro_context: str = "") -> str:
    options_section = f"\n## OTEVŘENÉ OPČNÍ POZICE\n\n{options_context}" if options_context and options_context != "Žádné opční pozice." else ""
    macro_section = f"\n## AKTUÁLNÍ MAKROEKONOMICKÝ KONTEXT (Fed, S&P 500)\n\n{macro_context}" if macro_context else ""
    return f"""Analyzuj následující portfolio a poskytni doporučení.

## DATA PORTFOLIA

{portfolio_context}

## POSLEDNÍCH 50 TRANSAKCÍ

{transactions_context}{options_section}{macro_section}

---

Vytvoř strukturovaný report podle zadané struktury. Pouze Markdown, žádný jiný text."""


def format_portfolio_context(holdings: list[dict], quotes: dict, tech_data: dict[str, dict]) -> str:
    """Format holdings with quotes and tech signals into a compact context string."""

    def f(v, d=2):
        return f"{v:.{d}f}" if v is not None else "N/A"

    def pct(v):
        if v is None:
            return "N/A"
        return f"+{v:.1f}%" if v > 0 else f"{v:.1f}%"

    lines = []
    total_value_czk = 0.0
    sector_czk: dict[str, float] = {}
    currency_czk: dict[str, float] = {}

    for h in holdings:
        # ticker, currency, sector, price_scale are nested inside the joined "stocks" object
        stock_info = h.get("stocks") or {}
        ticker = stock_info.get("ticker") or h.get("ticker", "?")
        shares = h.get("shares", 0)
        avg_cost = h.get("avg_cost_per_share", 0)
        currency = stock_info.get("currency") or h.get("currency", "USD")
        sector = stock_info.get("sector") or h.get("sector") or "N/A"
        invested_czk = h.get("total_invested_czk") or 0
        # price_scale converts raw yfinance price to user-facing currency unit
        # e.g. LSE stocks quote in pence → scale 0.01 → GBP
        price_scale = float(stock_info.get("price_scale") or h.get("price_scale") or 1.0)
        total_value_czk += invested_czk
        sector_czk[sector] = sector_czk.get(sector, 0.0) + invested_czk
        currency_czk[currency] = currency_czk.get(currency, 0.0) + invested_czk

        quote = quotes.get(ticker) or {}
        raw_price = quote.get("price")
        current_price = (raw_price * price_scale) if raw_price is not None else None
        change_pct = quote.get("changePercent")

        tech = tech_data.get(ticker) or {}
        rsi = tech.get("rsi14")
        trend = tech.get("trendSignal", "mixed")
        sma50 = tech.get("sma50")
        sma200 = tech.get("sma200")

        # Calculate unrealized P&L (both prices now in same currency unit)
        if current_price and avg_cost:
            unrealized_pct = ((current_price - avg_cost) / avg_cost) * 100
        else:
            unrealized_pct = None

        line = f"**{ticker}** | {f(shares, 4)} ks | avg ${f(avg_cost)} | nyní ${f(current_price)}"
        if unrealized_pct is not None:
            line += f" ({pct(unrealized_pct)})"
        if change_pct is not None:
            line += f" | dnes {pct(change_pct)}"
        line += f" | sektor: {sector} | měna: {currency} | trend: {trend}"
        if rsi is not None:
            line += f" | RSI: {f(rsi, 1)}"
        if sma50:
            line += f" | SMA50: ${f(sma50)}"
        if sma200:
            line += f" | SMA200: ${f(sma200)}"

        lines.append(line)

    header = f"Celkem pozic: {len(holdings)}"
    if total_value_czk > 0:
        header += f" | Investováno celkem: ~{total_value_czk:,.0f} CZK"

    # Sector breakdown
    if sector_czk and total_value_czk > 0:
        sector_parts = sorted(sector_czk.items(), key=lambda x: x[1], reverse=True)
        sector_str = " | ".join(
            f"{s}: {v / total_value_czk * 100:.0f}%" for s, v in sector_parts
        )
        header += f"\nSektory: {sector_str}"

    # Currency breakdown
    if currency_czk and total_value_czk > 0:
        currency_parts = sorted(currency_czk.items(), key=lambda x: x[1], reverse=True)
        currency_str = " | ".join(
            f"{c}: {v / total_value_czk * 100:.0f}%" for c, v in currency_parts
        )
        header += f"\nMěny: {currency_str}"

    return header + "\n\n" + "\n".join(lines)


def format_options_context(option_holdings: list[dict]) -> str:
    """Format open option positions into a compact context string."""
    if not option_holdings:
        return "Žádné opční pozice."

    from datetime import date as date_type

    today = date_type.today()
    lines = []
    total_premium_value = 0.0
    total_contracts = 0

    for pos in option_holdings:
        symbol = pos.get("symbol", "?")
        option_type = pos.get("option_type", "?")
        position = pos.get("position", "?")  # "long" or "short"
        strike = pos.get("strike_price")
        expiry_raw = pos.get("expiration_date")
        expiry = str(expiry_raw or "?")[:10]
        net_contracts = pos.get("net_contracts") or pos.get("contracts", 0)
        avg_premium = pos.get("avg_premium")
        unrealized_pnl = pos.get("unrealized_pnl")

        total_contracts += abs(net_contracts or 0)
        if avg_premium and net_contracts:
            total_premium_value += abs(net_contracts) * avg_premium * 100

        # Urgency flag based on days to expiry
        urgency = ""
        if expiry_raw:
            try:
                exp_date = date_type.fromisoformat(str(expiry_raw)[:10])
                days_left = (exp_date - today).days
                if days_left <= 30:
                    urgency = f" [URGENTNÍ — {days_left}d]"
                elif days_left <= 60:
                    urgency = f" [BRZY — {days_left}d]"
            except ValueError:
                pass

        line = f"{symbol} {position.upper()} {option_type.upper()} ${strike} exp {expiry}{urgency} | {net_contracts} kontraktů"
        if avg_premium is not None:
            line += f" | avg prémium ${avg_premium:.2f}"
        if unrealized_pnl is not None:
            sign = "+" if unrealized_pnl >= 0 else ""
            line += f" | P&L {sign}${unrealized_pnl:.2f}"
        lines.append(line)

    summary = f"Celkem opčních pozic: {len(option_holdings)} | Celkem kontraktů: {total_contracts}"
    if total_premium_value > 0:
        summary += f" | Celková prémie (vázaný kapitál): ~${total_premium_value:,.0f}"

    return summary + "\n\n" + "\n".join(lines)


def format_transactions_context(transactions: list[dict]) -> str:
    """Format last N transactions into a compact context string."""
    if not transactions:
        return "Žádné transakce."

    lines = []
    for tx in transactions:
        ticker = tx.get("ticker") or (tx.get("stocks") or {}).get("ticker", "?")
        tx_type = tx.get("type", "?")
        shares = tx.get("shares", 0)
        price = tx.get("price_per_share") or tx.get("price", 0)
        currency = tx.get("currency", "USD")
        date = (tx.get("executed_at") or tx.get("date", ""))[:10]

        lines.append(f"{date} | {tx_type} {shares} ks {ticker} @ ${price:.2f} {currency}")

    return "\n".join(lines)
