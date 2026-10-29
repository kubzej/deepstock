"""Daily series of the stock performance chart: market value, cost basis (as on the Přehled) and cashflow."""
import itertools
from datetime import date

import pandas as pd
import pytest

from app.services import performance as performance_module
from app.services.performance import StockSeriesPoint, _build_stock_series, _period_return
from app.services.portfolio_accounting import calculate_stock_holding_totals
from tests.fake_supabase import FakeSupabase

RATES = {"USD": 20.0, "CZK": 1.0, "GBP": 30.0}
_ids = itertools.count(1)


def tx(
    kind,
    day,
    shares=1,
    price=100.0,
    *,
    ticker="AAPL",
    currency="CZK",
    rate=1.0,
    portfolio="p1",
    fees=0.0,
    source=None,
    price_scale=1,
):
    return {
        "id": f"tx-{next(_ids)}",
        "portfolio_id": portfolio,
        "stock_id": f"stock-{ticker}",
        "type": kind,
        "executed_at": f"{day}T00:00:00+00:00",
        "shares": shares,
        "total_amount": shares * price,
        "total_amount_czk": None,
        "exchange_rate_to_czk": rate,
        "currency": currency,
        "fees": fees,
        "source_transaction_id": source,
        "stocks": {"ticker": ticker, "currency": currency, "price_scale": price_scale},
    }


def prices(days_and_prices, ticker="AAPL"):
    days, values = zip(*days_and_prices)
    return pd.DataFrame({ticker: values}, index=pd.to_datetime(list(days)))


def series(transactions, close_prices, start=date(2026, 3, 1), info=None):
    info = info or {"AAPL": {"currency": "CZK", "price_scale": 1}}
    points = _build_stock_series(
        transactions=transactions,
        close_prices=close_prices,
        ticker_info=info,
        rates=RATES,
        display_start_date=start,
    )
    return {p.date: (p.value_czk, p.cost_basis_czk, p.net_cashflow_czk) for p in points}


# Monday..Thursday: price 100, 110, 120, 120
WEEK = prices([("2026-03-02", 100.0), ("2026-03-03", 110.0), ("2026-03-04", 120.0), ("2026-03-05", 120.0)])


class TestCostBasisMatchesThePrehled:
    def test_selling_half_leaves_the_cost_of_the_shares_still_held(self):
        result = series([tx("BUY", "2026-03-02", 10, 100), tx("SELL", "2026-03-04", 5, 120)], WEEK)

        assert result["2026-03-02"] == (1000, 1000, -1000)
        assert result["2026-03-03"] == (1100, 1000, -1000)
        # value 5 x 120; cost of the 5 still held; cash: paid 1000, received 600
        assert result["2026-03-04"] == (600, 500, -400)
        assert result["2026-03-05"] == (600, 500, -400)

    def test_after_selling_everything_the_series_goes_on_with_zero_cost_basis(self):
        result = series([tx("BUY", "2026-03-02", 10, 100), tx("SELL", "2026-03-04", 10, 120)], WEEK)

        assert list(result) == ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]
        assert result["2026-03-04"] == (0, 0, 200)
        assert result["2026-03-05"] == (0, 0, 200)

    def test_cost_basis_is_never_negative_even_when_proceeds_exceed_everything_paid(self):
        result = series([tx("BUY", "2026-03-02", 10, 100), tx("SELL", "2026-03-04", 10, 500)], WEEK)

        assert all(cost_basis >= 0 for _, cost_basis, _ in result.values())

    def test_last_day_equals_the_sum_of_holdings_totals(self):
        transactions = [
            tx("BUY", "2026-03-02", 10, 100, fees=3),
            tx("BUY", "2026-03-03", 10, 120, ticker="MSFT"),
            tx("BUY", "2026-03-03", 4, 90, portfolio="p2"),
            tx("SELL", "2026-03-04", 6, 130),
            tx("SELL", "2026-03-05", 2, 95, portfolio="p2", fees=1),
        ]
        close_prices = pd.concat([WEEK, prices([(d, 50.0) for d in WEEK.index.strftime("%Y-%m-%d")], "MSFT")], axis=1)
        info = {"AAPL": {"currency": "CZK", "price_scale": 1}, "MSFT": {"currency": "CZK", "price_scale": 1}}

        result = series(transactions, close_prices, info=info)

        positions = {}
        for t in transactions:
            positions.setdefault((t["portfolio_id"], t["stock_id"]), []).append(t)
        expected = sum(calculate_stock_holding_totals(group).total_invested_czk for group in positions.values())
        assert result["2026-03-05"][1] == pytest.approx(expected)


class TestLotsAndPositions:
    def test_selling_from_a_chosen_lot_leaves_the_other_lots_cost_untouched(self):
        lot_old = tx("BUY", "2026-03-02", 10, 100)
        lot_new = tx("BUY", "2026-03-03", 10, 120)
        sell = tx("SELL", "2026-03-04", 4, 130, source=lot_new["id"])

        result = series([lot_old, lot_new, sell], WEEK)

        # 10 x 100 from the old lot + 6 x 120 left of the chosen lot
        assert result["2026-03-04"][1] == 1000 + 720

    def test_selling_without_a_chosen_lot_uses_the_oldest_lot_first(self):
        lot_old = tx("BUY", "2026-03-02", 10, 100)
        lot_new = tx("BUY", "2026-03-03", 10, 120)

        result = series([lot_old, lot_new, tx("SELL", "2026-03-04", 4, 130)], WEEK)

        # 6 x 100 left of the old lot + 10 x 120
        assert result["2026-03-04"][1] == 600 + 1200

    def test_the_same_stock_in_two_portfolios_is_accounted_separately(self):
        result = series(
            [
                tx("BUY", "2026-03-02", 10, 100, portfolio="p1"),
                tx("BUY", "2026-03-03", 10, 200, portfolio="p2"),
                tx("SELL", "2026-03-04", 10, 210, portfolio="p2"),
            ],
            WEEK,
        )

        # p2 sold its own lot; p1's lot (10 x 100) is untouched and still held
        assert result["2026-03-04"][1] == 1000
        assert result["2026-03-04"][0] == 10 * 120

    def test_shares_of_the_same_stock_in_several_portfolios_are_valued_together(self):
        result = series(
            [tx("BUY", "2026-03-02", 3, 100, portfolio="p1"), tx("BUY", "2026-03-02", 2, 100, portfolio="p2")],
            WEEK,
        )

        assert result["2026-03-02"][0] == 5 * 100


class TestFeesAndCurrencies:
    def test_buy_fee_is_part_of_the_cost_basis_and_the_cash_paid(self):
        result = series([tx("BUY", "2026-03-02", 1, 100, currency="USD", rate=20.0, fees=5)], WEEK,
                        info={"AAPL": {"currency": "USD", "price_scale": 1}})

        assert result["2026-03-02"][1:] == (2100, -2100)  # 100 USD + 5 USD fee at 20 CZK

    def test_sell_fee_reduces_the_cash_received_but_not_the_cost_of_what_is_left(self):
        result = series(
            [tx("BUY", "2026-03-02", 2, 100), tx("SELL", "2026-03-04", 1, 120, fees=5)], WEEK
        )

        assert result["2026-03-04"][1] == 100  # one share of cost 100 still held
        assert result["2026-03-04"][2] == -200 + (120 - 5)  # paid 200, received 115

    def test_foreign_stock_is_valued_with_price_scale_and_rate_and_costed_with_the_trade_rate(self):
        close_prices = prices([("2026-03-02", 500.0)], "XYZ")  # pence
        info = {"XYZ": {"currency": "GBP", "price_scale": 0.01}}

        result = series(
            [tx("BUY", "2026-03-02", 100, 5.0, ticker="XYZ", currency="GBP", rate=28.0, price_scale=0.01)],
            close_prices,
            info=info,
        )

        value, cost_basis, _ = result["2026-03-02"]
        assert value == pytest.approx(100 * 500 * 0.01 * 30.0)  # today's rate
        assert cost_basis == pytest.approx(100 * 5.0 * 28.0)  # rate of the trade


class TestWhichDaysAreIncluded:
    def test_days_before_the_first_transaction_are_left_out(self):
        result = series([tx("BUY", "2026-03-03", 1, 100)], WEEK)

        assert list(result) == ["2026-03-03", "2026-03-04", "2026-03-05"]

    def test_points_before_the_display_start_are_left_out(self):
        result = series([tx("BUY", "2026-03-02", 1, 100)], WEEK, start=date(2026, 3, 4))

        assert list(result) == ["2026-03-04", "2026-03-05"]

    def test_weekend_buy_takes_effect_on_the_next_trading_day(self):
        friday_to_tuesday = prices([("2026-03-06", 100.0), ("2026-03-09", 100.0), ("2026-03-10", 100.0)])

        result = series([tx("BUY", "2026-03-06"), tx("BUY", "2026-03-07")], friday_to_tuesday)

        assert result["2026-03-06"][:2] == (100, 100)
        assert result["2026-03-09"][:2] == (200, 200)
        assert result["2026-03-10"][:2] == (200, 200)

    def test_weekend_sell_reduces_the_position_from_the_next_trading_day(self):
        friday_to_tuesday = prices([("2026-03-06", 100.0), ("2026-03-09", 100.0), ("2026-03-10", 100.0)])

        result = series([tx("BUY", "2026-03-06", 2), tx("SELL", "2026-03-08", 1)], friday_to_tuesday)

        assert result["2026-03-06"][:2] == (200, 200)
        assert result["2026-03-09"][:2] == (100, 100)

    def test_first_trade_on_a_weekend_before_the_first_price_is_applied(self):
        monday_tuesday = prices([("2026-03-09", 100.0), ("2026-03-10", 100.0)])

        result = series([tx("BUY", "2026-03-07")], monday_tuesday)

        assert result["2026-03-09"][:2] == (100, 100)

    def test_trade_after_the_last_price_day_is_not_part_of_the_series(self):
        result = series([tx("BUY", "2026-03-02"), tx("BUY", "2026-03-09")], WEEK)

        assert result["2026-03-05"][:2] == (120, 100)


class TestPeriodReturn:
    @staticmethod
    def point(value, cashflow):
        return StockSeriesPoint(date="d", value_czk=value, cost_basis_czk=0.0, net_cashflow_czk=cashflow)

    def test_holding_only_return_is_the_change_of_value(self):
        total, pct = _period_return(self.point(1000, -1000), self.point(1100, -1000))

        assert (total, pct) == (100, 10)

    def test_money_added_during_the_period_is_not_counted_as_profit(self):
        total, pct = _period_return(self.point(1000, -1000), self.point(2200, -2000))

        assert total == 200  # value grew by 1200, of which 1000 is newly bought shares

    @staticmethod
    def between(result, first_day, last_day):
        def point(day):
            value, _, cashflow = result[day]
            return StockSeriesPoint(day, value, 0.0, cashflow)

        return point(first_day), point(last_day)

    def test_realized_profit_counts(self):
        result = series([tx("BUY", "2026-03-02", 10, 100), tx("SELL", "2026-03-04", 5, 120)], WEEK)

        total, pct = _period_return(*self.between(result, "2026-03-02", "2026-03-05"))

        # 5 shares still held gained 100 (unrealized) and 5 sold shares gained 100 (realized)
        assert total == 200 and pct == 20

    def test_return_after_selling_everything_is_the_realized_profit(self):
        result = series([tx("BUY", "2026-03-02", 10, 100), tx("SELL", "2026-03-04", 10, 120)], WEEK)

        assert _period_return(*self.between(result, "2026-03-02", "2026-03-05"))[0] == 200

    def test_percentage_is_zero_when_the_period_starts_without_value(self):
        assert _period_return(self.point(0, 0), self.point(500, -500))[1] == 0


class FakeRedis:
    async def get(self, _key):
        return None

    async def set(self, *_args, **_kwargs):
        return None


async def test_get_stock_performance_reports_cost_basis_as_invested_and_the_realized_return(monkeypatch):
    db = FakeSupabase()
    db.tables["portfolios"] = [{"id": "p1", "user_id": "u1"}]
    db.tables["transactions"] = [
        tx("BUY", "2026-03-02", 10, 100),
        tx("SELL", "2026-03-04", 10, 120),
    ]

    async def get_rates():
        return RATES

    monkeypatch.setattr(performance_module, "supabase", db)
    monkeypatch.setattr(performance_module, "get_redis", lambda: FakeRedis())
    monkeypatch.setattr(performance_module.exchange_service, "get_rates", get_rates)
    monkeypatch.setattr(
        performance_module.yf, "download", lambda *args, **kwargs: pd.DataFrame({"Close": WEEK["AAPL"].values}, index=WEEK.index)
    )

    result = await performance_module.get_stock_performance("u1", period="ALL")

    assert [(p.date, p.value, p.invested) for p in result.data] == [
        ("2026-03-02", 1000, 1000),
        ("2026-03-03", 1100, 1000),
        ("2026-03-04", 0, 0),
        ("2026-03-05", 0, 0),
    ]
    assert result.total_return == 200 and result.total_return_pct == 20
