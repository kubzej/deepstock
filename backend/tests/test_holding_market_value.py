"""One definition of a position's market value in CZK, shared by the snapshot, the MCP summary and the advisor."""
import pytest

from app.services.portfolio_accounting import holding_market_value_czk


def test_value_is_price_times_scale_shares_and_rate():
    assert holding_market_value_czk(shares=10, price=150.0, price_scale=1, fx_rate=20.0) == 30000.0


def test_price_scale_converts_pence_to_pounds():
    assert holding_market_value_czk(shares=100, price=500.0, price_scale=0.01, fx_rate=25.0) == pytest.approx(12500.0)


@pytest.mark.parametrize("price", [None, 0, 0.0, -1.5])
def test_a_missing_or_unusable_price_has_no_value(price):
    assert holding_market_value_czk(shares=10, price=price, price_scale=1, fx_rate=20.0) is None


def test_a_priced_position_with_no_shares_is_worth_zero_not_missing():
    assert holding_market_value_czk(shares=0, price=150.0, price_scale=1, fx_rate=20.0) == 0.0
