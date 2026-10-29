"""The advisor sees what the portfolio is worth now: weights from market value, unpriced positions called out."""
from app.ai.prompts.portfolio_advisor_prompt import format_portfolio_context

RATES = {"USD": 20.0, "CZK": 1.0, "GBP": 25.0}


def holding(ticker, shares, invested_czk, sector, currency="USD", price_scale=1):
    return {
        "shares": shares,
        "total_invested_czk": invested_czk,
        "avg_cost_per_share": 100.0,
        "stocks": {"ticker": ticker, "currency": currency, "sector": sector, "price_scale": price_scale},
    }


def snapshot(**overrides):
    base = {
        "total_value_czk": 400000.0, "total_cost_czk": 200000.0, "total_pnl_czk": 200000.0,
        "total_pnl_percent": 100.0, "daily_change_czk": 0.0, "daily_change_percent": 0.0, "missing_tickers": [],
    }
    return {**base, **overrides}


def line(context, label):
    return next(row for row in context.splitlines() if row.startswith(label))


def format_context(holdings, quotes, snap=None, rates=RATES):
    return format_portfolio_context(holdings, quotes, {}, snap or snapshot(), rates)


def test_weights_follow_current_value_not_the_amount_invested():
    # same 100 000 CZK invested in both, but AAPL is now worth three times XOM
    holdings = [holding("AAPL", 10, 100000, "Technology"), holding("XOM", 10, 100000, "Energy")]
    quotes = {"AAPL": {"price": 1500.0}, "XOM": {"price": 500.0}}

    context = format_context(holdings, quotes)

    assert "Technology: 75%" in line(context, "Sektory") and "Energy: 25%" in line(context, "Sektory")
    assert line(context, "Největší pozice").endswith("AAPL: 75% | XOM: 25%")
    assert "50%" not in context


def test_exposure_lines_say_what_the_percentages_are_of():
    context = format_context([holding("AAPL", 10, 1, "Technology")], {"AAPL": {"price": 1500.0}})

    for label in ("Sektory", "Měny", "Největší pozice"):
        assert "(podíl na aktuální hodnotě)" in line(context, label)


def test_unpriced_position_is_left_out_of_the_weights_and_named():
    holdings = [holding("AAPL", 10, 100000, "Technology"), holding("BBB", 50, 500000, "Energy")]

    context = format_context(holdings, {"AAPL": {"price": 1500.0}}, snapshot(missing_tickers=["BBB"]))

    assert line(context, "Sektory").endswith("Technology: 100%")
    assert "BBB" not in line(context, "Největší pozice")
    assert "chybí aktuální cena pro BBB" in context
    assert "ani v rozložení sektorů, měn a pozic" in context


def test_no_exposure_lines_when_nothing_has_a_price():
    context = format_context([holding("BBB", 5, 1000, "Energy")], {}, snapshot(missing_tickers=["BBB"]))

    assert not any(row.startswith(("Sektory", "Měny", "Největší pozice")) for row in context.splitlines())
    assert "chybí aktuální cena pro BBB" in context


def test_currency_weights_use_czk_values_and_price_scale():
    # LSE quotes pence: 100 shares at 500p = 500 GBP = 12 500 CZK, a third of the CZK holding (37 500)
    holdings = [
        holding("VOD.L", 100, 1, "Telecom", currency="GBP", price_scale=0.01),
        holding("CEZ", 375, 1, "Utilities", currency="CZK"),
    ]
    quotes = {"VOD.L": {"price": 500.0}, "CEZ": {"price": 100.0}}

    context = format_context(holdings, quotes)

    assert line(context, "Měny").endswith("CZK: 75% | GBP: 25%")


def test_a_currency_without_a_rate_is_valued_at_one_like_the_snapshot_does():
    context = format_context([holding("SAP", 10, 1, "Technology", currency="EUR")], {"SAP": {"price": 100.0}}, rates={})

    assert "EUR: 100%" in line(context, "Měny")


def test_a_ticker_held_in_several_portfolios_is_one_position():
    holdings = [holding("AAPL", 10, 1, "Technology"), holding("AAPL", 10, 1, "Technology"), holding("XOM", 10, 1, "Energy")]
    quotes = {"AAPL": {"price": 1500.0}, "XOM": {"price": 1500.0}}

    context = format_context(holdings, quotes)

    assert line(context, "Největší pozice").endswith("AAPL: 67% | XOM: 33%")


def test_only_the_five_largest_positions_are_listed():
    holdings = [holding(f"T{i}", 10 * (i + 1), 1, "Technology") for i in range(7)]
    quotes = {f"T{i}": {"price": 100.0} for i in range(7)}

    context = format_context(holdings, quotes)

    listed = line(context, "Největší pozice").split(": ", 1)[1].split(" | ")
    assert [entry.split(":")[0] for entry in listed] == ["T6", "T5", "T4", "T3", "T2"]


def test_header_totals_come_from_the_snapshot():
    snap = snapshot(total_value_czk=12000.0, total_cost_czk=10000.0, total_pnl_czk=2000.0, total_pnl_percent=20.0,
                    daily_change_czk=-300.0, daily_change_percent=-2.4)

    header = format_context([holding("AAPL", 1, 1, "Technology")], {"AAPL": {"price": 1.0}}, snap).splitlines()[0]

    assert "Aktuální hodnota: ~12,000 CZK" in header and "Náklad: ~10,000 CZK" in header
    assert "P/L: +2,000 CZK (+20.0%)" in header and "Dnes: -300 CZK (-2.4%)" in header


def test_no_missing_price_warning_when_every_position_is_priced():
    context = format_context([holding("AAPL", 1, 1, "Technology")], {"AAPL": {"price": 1.0}})

    assert "chybí aktuální cena" not in context
