"""
Prompt template for AI Portfolio Advisor.
Analyzes holdings, technical signals, and recent transactions.
Returns a structured Markdown report in Czech.
"""
from app.services.portfolio_accounting import holding_market_value_czk

SYSTEM_PROMPT = """Jsi zkušený portfolio poradce. Analyzuješ akciové portfolio českého investora a poskytneš mu konkrétní, akční doporučení.

## KRITICKÁ PRAVIDLA — NIKDY NEPORUŠUJ

1. **Pouze z dat.** Vycházej VÝHRADNĚ z poskytnutých dat — holding, technické signály, transakce. Nikdy nevymýšlej informace, které nejsou v datech.

2. **Konkrétní a akční.** Vyhni se obecným frázím jako "diverzifikuj portfolio". Odkazuj na konkrétní tickery a čísla z dat.

3. **Výstup v Markdownu.** Strukturovaná zpráva s nadpisy (##, ###). Bez úvodní věty jako "Zde je analýza...".

4. **Jazyk: česky.** Celý výstup v češtině.

5. **Délka: 500–900 slov.** Pokryj všechny sekce, ale bez zbytečného rozvlékání.

6. **Zachovej neutrální tón.** Nepředstírej, že víš, co trh udělá. Uváděj rizika i příležitosti.

7. **Bez duplicit.** Neopakuj stejný problém nebo stejný ticker ve více sekcích stejnými slovy. V závěru pouze syntetizuj důsledky.

## STRUKTURA VÝSTUPU

## Přehled portfolia
Krátké shrnutí celkového stavu portfolia: velikost, aktuální hodnota, P/L, počet pozic a hlavní charakter portfolia.

## Expozice a koncentrace
Uveď konkrétní rozložení podle sektorů a měn, největší pozice a případnou koncentraci. Pokud je portfolio příliš koncentrované v jednom sektoru, měně nebo tickeru, pojmenuj to jasně. Sem zahrň i poměr akciových a opčních pozic, ale pouze pokud je z dat zřejmý.

## Klíčové pozice
Vyber nejdůležitější pozice v portfoliu. U každé stručně vysvětli, co pomáhá nebo škodí: trend, RSI, P/L, velikost pozice nebo role v portfoliu. Nevyjmenovávej vše; soustřeď se na 3–5 nejrelevantnějších tickerů.

## Opce a časová rizika
Pokud existují opce nebo blízké expirace, shrň hlavní opční rizika a priority. Zvlášť upozorni na pozice označené [URGENTNÍ] (≤30 dní) nebo [BRZY] (≤60 dní), zejména u short opcí. Pokud žádné relevantní opční riziko není, sekci vynech.

## Makro a kontext
Pokud jsou k dispozici data o Fedu a stavu S&P 500, stručně vysvětli, jak současné makro podmínky dopadají na sektory nebo typy pozic v portfoliu. Pokud z makra neplyne nic podstatného, buď stručný. Pokud data nejsou, sekci vynech.

## Doporučení
2–4 konkrétní akční kroky seřazené podle priority. Každý krok musí být navázaný na konkrétní ticker, koncentraci, expiraci nebo trend. Pokud poslední transakce naznačují směr portfolia, krátce to zohledni zde místo samostatné duplicitní sekce."""


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


def format_portfolio_context(
    holdings: list[dict],
    quotes: dict,
    tech_data: dict[str, dict],
    snapshot: dict,
    rates: dict[str, float],
) -> str:
    """
    Format holdings with quotes and tech signals into a compact context string.

    Totals come from the snapshot. Sector, currency and position weights are shares of the
    current market value, so they describe what the portfolio is now, not what was invested.
    Positions without a live price are left out of them, as the snapshot does.
    """

    def f(v, d=2):
        return f"{v:.{d}f}" if v is not None else "N/A"

    def pct(v):
        if v is None:
            return "N/A"
        return f"+{v:.1f}%" if v > 0 else f"{v:.1f}%"

    def weights(value_by_key: dict[str, float], total: float) -> str:
        ranked = sorted(value_by_key.items(), key=lambda item: item[1], reverse=True)
        return " | ".join(f"{key}: {value / total * 100:.0f}%" for key, value in ranked)

    lines = []
    sector_czk: dict[str, float] = {}
    currency_czk: dict[str, float] = {}
    position_czk: dict[str, float] = {}

    for h in holdings:
        # ticker, currency, sector, price_scale are nested inside the joined "stocks" object
        stock_info = h.get("stocks") or {}
        ticker = stock_info.get("ticker") or h.get("ticker", "?")
        shares = h.get("shares", 0)
        avg_cost = h.get("avg_cost_per_share") or h.get("avg_cost") or 0
        currency = stock_info.get("currency") or h.get("currency", "USD")
        sector = stock_info.get("sector") or h.get("sector") or "N/A"
        # price_scale converts raw yfinance price to user-facing currency unit
        # e.g. LSE stocks quote in pence → scale 0.01 → GBP
        price_scale = float(stock_info.get("price_scale") or h.get("price_scale") or 1.0)

        quote = quotes.get(ticker) or {}
        raw_price = quote.get("price")
        current_price = (raw_price * price_scale) if raw_price is not None else None
        change_pct = quote.get("changePercent")

        value_czk = holding_market_value_czk(
            float(shares or 0), raw_price, price_scale, float(rates.get(currency, 1.0))
        )
        if value_czk is not None:
            sector_czk[sector] = sector_czk.get(sector, 0.0) + value_czk
            currency_czk[currency] = currency_czk.get(currency, 0.0) + value_czk
            position_czk[ticker] = position_czk.get(ticker, 0.0) + value_czk

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

    pnl_sign = "+" if snapshot["total_pnl_czk"] >= 0 else ""
    day_sign = "+" if snapshot["daily_change_czk"] >= 0 else ""
    header = (
        f"Celkem pozic: {len(holdings)}"
        f" | Aktuální hodnota: ~{snapshot['total_value_czk']:,.0f} CZK"
        f" | Náklad: ~{snapshot['total_cost_czk']:,.0f} CZK"
        f" | P/L: {pnl_sign}{snapshot['total_pnl_czk']:,.0f} CZK ({pct(snapshot['total_pnl_percent'])})"
        f" | Dnes: {day_sign}{snapshot['daily_change_czk']:,.0f} CZK ({pct(snapshot['daily_change_percent'])})"
    )

    missing_tickers = snapshot.get("missing_tickers")
    if missing_tickers:
        header += (
            f"\nPozor: chybí aktuální cena pro {', '.join(missing_tickers)} — "
            "tyto pozice nejsou v hodnotě, nákladu, P/L ani v rozložení sektorů, měn a pozic."
        )

    priced_total = sum(position_czk.values())
    if priced_total > 0:
        top_positions = dict(sorted(position_czk.items(), key=lambda item: item[1], reverse=True)[:5])
        header += (
            f"\nSektory (podíl na aktuální hodnotě): {weights(sector_czk, priced_total)}"
            f"\nMěny (podíl na aktuální hodnotě): {weights(currency_czk, priced_total)}"
            f"\nNejvětší pozice (podíl na aktuální hodnotě): {weights(top_positions, priced_total)}"
        )

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
    long_positions = 0
    short_positions = 0
    urgent_count = 0
    soon_count = 0
    underlyings: set[str] = set()

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
        underlyings.add(symbol)
        if position == "long":
            long_positions += 1
        elif position == "short":
            short_positions += 1
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
                    urgent_count += 1
                elif days_left <= 60:
                    urgency = f" [BRZY — {days_left}d]"
                    soon_count += 1
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
    summary += f" | LONG: {long_positions} | SHORT: {short_positions}"
    if total_premium_value > 0:
        summary += f" | Celková prémie (vázaný kapitál): ~${total_premium_value:,.0f}"
    if underlyings:
        summary += f"\nPodklady s opcemi: {', '.join(sorted(underlyings))}"
    if urgent_count or soon_count:
        summary += f"\nČasová rizika: urgentní ≤30d: {urgent_count} | brzy ≤60d: {soon_count}"

    return summary + "\n\n" + "\n".join(lines)


def format_transactions_context(transactions: list[dict]) -> str:
    """Format last N transactions into a compact context string."""
    if not transactions:
        return "Žádné transakce."

    lines = []
    buy_count = 0
    sell_count = 0
    buy_shares_by_ticker: dict[str, float] = {}
    sell_shares_by_ticker: dict[str, float] = {}
    for tx in transactions:
        ticker = tx.get("ticker") or (tx.get("stocks") or {}).get("ticker", "?")
        tx_type = tx.get("type", "?")
        shares = tx.get("shares", 0)
        price = tx.get("price_per_share") or tx.get("price", 0)
        currency = tx.get("currency", "USD")
        date = (tx.get("executed_at") or tx.get("date", ""))[:10]

        if tx_type == "BUY":
            buy_count += 1
            buy_shares_by_ticker[ticker] = buy_shares_by_ticker.get(ticker, 0.0) + float(shares or 0)
        elif tx_type == "SELL":
            sell_count += 1
            sell_shares_by_ticker[ticker] = sell_shares_by_ticker.get(ticker, 0.0) + float(shares or 0)

        lines.append(f"{date} | {tx_type} {shares} ks {ticker} @ ${price:.2f} {currency}")

    summary_parts = [f"BUY: {buy_count}", f"SELL: {sell_count}"]
    if buy_shares_by_ticker:
        top_buy = max(buy_shares_by_ticker.items(), key=lambda item: item[1])
        summary_parts.append(f"Nejvíc přikupováno: {top_buy[0]} ({top_buy[1]:.2f} ks)")
    if sell_shares_by_ticker:
        top_sell = max(sell_shares_by_ticker.items(), key=lambda item: item[1])
        summary_parts.append(f"Nejvíc redukováno: {top_sell[0]} ({top_sell[1]:.2f} ks)")

    return " | ".join(summary_parts) + "\n\n" + "\n".join(lines)
