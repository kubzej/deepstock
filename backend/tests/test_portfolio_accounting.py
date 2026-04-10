from typing import Optional

from app.services.portfolio_accounting import (
    annotate_stock_transactions,
    calculate_stock_holding_totals,
    compute_lot_remaining_shares,
)


def make_tx(
    tx_id: str,
    tx_type: str,
    shares: float,
    price: float,
    *,
    fees: float = 0.0,
    exchange_rate_to_czk: Optional[float] = None,
    source_transaction_id: Optional[str] = None,
) -> dict:
    total_amount = shares * price
    return {
        "id": tx_id,
        "type": tx_type,
        "shares": shares,
        "price_per_share": price,
        "total_amount": total_amount,
        "total_amount_czk": (
            total_amount * exchange_rate_to_czk
            if exchange_rate_to_czk is not None
            else None
        ),
        "exchange_rate_to_czk": exchange_rate_to_czk,
        "fees": fees,
        "source_transaction_id": source_transaction_id,
    }


class TestPortfolioAccounting:
    def test_buy_fees_increase_cost_basis(self):
        result = calculate_stock_holding_totals(
            [
                make_tx(
                    "buy-1",
                    "BUY",
                    10,
                    100,
                    fees=5,
                    exchange_rate_to_czk=24,
                )
            ]
        )

        assert result.shares == 10
        assert result.total_cost == 1005
        assert result.total_invested_czk == 24120
        assert result.realized_pnl == 0

    def test_sell_fees_reduce_realized_pnl(self):
        result = calculate_stock_holding_totals(
            [
                make_tx("buy-1", "BUY", 10, 100, fees=5),
                make_tx("sell-1", "SELL", 10, 120, fees=5),
            ]
        )

        assert result.shares == 0
        assert result.total_cost == 0
        assert result.total_invested_czk == 0
        assert result.realized_pnl == 190

    def test_partial_sell_allocates_buy_fees_to_remaining_cost_basis(self):
        result = calculate_stock_holding_totals(
            [
                make_tx("buy-1", "BUY", 10, 100, fees=10),
                make_tx("sell-1", "SELL", 4, 120, fees=4),
            ]
        )

        assert result.shares == 6
        assert result.total_cost == 606
        assert result.total_invested_czk == 606
        assert result.realized_pnl == 72

    def test_lot_linked_sell_uses_selected_lot_cost_basis(self):
        result = calculate_stock_holding_totals(
            [
                make_tx("buy-1", "BUY", 5, 100, fees=5),
                make_tx("buy-2", "BUY", 5, 110),
                make_tx(
                    "sell-1",
                    "SELL",
                    3,
                    130,
                    fees=3,
                    source_transaction_id="buy-2",
                ),
            ]
        )

        assert result.shares == 7
        assert result.total_cost == 725
        assert result.total_invested_czk == 725
        assert result.realized_pnl == 57

    def test_fifo_sell_fallback_uses_oldest_lots_first(self):
        result = calculate_stock_holding_totals(
            [
                make_tx("buy-1", "BUY", 5, 100, fees=5),
                make_tx("buy-2", "BUY", 5, 110),
                make_tx("sell-1", "SELL", 6, 120, fees=6),
            ]
        )

        assert result.shares == 4
        assert result.total_cost == 440
        assert result.total_invested_czk == 440
        assert result.realized_pnl == 99

    def test_total_invested_czk_keeps_fee_adjusted_historical_fx(self):
        result = calculate_stock_holding_totals(
            [
                make_tx(
                    "buy-1",
                    "BUY",
                    2,
                    100,
                    fees=4,
                    exchange_rate_to_czk=22,
                ),
                make_tx(
                    "sell-1",
                    "SELL",
                    1,
                    120,
                    fees=2,
                    exchange_rate_to_czk=23,
                ),
            ]
        )

        assert result.shares == 1
        assert result.total_cost == 102
        assert result.total_invested_czk == 2244
        assert result.realized_pnl == 16

    def test_annotation_exposes_fee_aware_transaction_fields(self):
        annotated = annotate_stock_transactions(
            [
                make_tx("buy-1", "BUY", 10, 100, fees=10, exchange_rate_to_czk=24),
                make_tx(
                    "sell-1",
                    "SELL",
                    4,
                    120,
                    fees=4,
                    exchange_rate_to_czk=25,
                ),
            ]
        )

        buy = annotated[0]
        sell = annotated[1]

        assert buy["economic_amount"] == 1010
        assert buy["net_cashflow"] == -1010
        assert buy["remaining_shares"] == 6
        assert buy["remaining_cost_basis"] == 606
        assert buy["remaining_cost_basis_czk"] == 14544

        assert sell["net_cashflow"] == 476
        assert sell["net_cashflow_czk"] == 11900
        assert sell["cost_basis_sold"] == 404
        assert sell["cost_basis_sold_czk"] == 9696
        assert sell["realized_pnl"] == 72
        assert sell["realized_pnl_czk"] == 2204


class TestComputeLotRemainingShares:
    def test_buys_only_all_shares_remaining(self):
        result = compute_lot_remaining_shares(
            [
                make_tx("buy-1", "BUY", 10, 100),
                make_tx("buy-2", "BUY", 5, 110),
            ]
        )
        assert result == {"buy-1": 10.0, "buy-2": 5.0}

    def test_linked_sell_reduces_correct_lot(self):
        result = compute_lot_remaining_shares(
            [
                make_tx("buy-1", "BUY", 10, 100),
                make_tx("buy-2", "BUY", 5, 110),
                make_tx("sell-1", "SELL", 3, 120, source_transaction_id="buy-2"),
            ]
        )
        assert result["buy-1"] == 10.0
        assert result["buy-2"] == 2.0

    def test_fifo_fallback_sell_consumes_oldest_lot_first(self):
        result = compute_lot_remaining_shares(
            [
                make_tx("buy-1", "BUY", 5, 100),
                make_tx("buy-2", "BUY", 5, 110),
                make_tx("sell-1", "SELL", 7, 120),  # no source_transaction_id
            ]
        )
        assert result["buy-1"] == 0.0
        assert result["buy-2"] == 3.0

    def test_mixed_linked_and_fifo_sells(self):
        result = compute_lot_remaining_shares(
            [
                make_tx("buy-1", "BUY", 10, 100),
                make_tx("buy-2", "BUY", 10, 110),
                make_tx("sell-1", "SELL", 3, 120, source_transaction_id="buy-2"),
                make_tx("sell-2", "SELL", 4, 115),  # FIFO — hits buy-1
            ]
        )
        assert result["buy-1"] == 6.0
        assert result["buy-2"] == 7.0

    def test_fully_consumed_lot_has_zero_remaining(self):
        result = compute_lot_remaining_shares(
            [
                make_tx("buy-1", "BUY", 5, 100),
                make_tx("sell-1", "SELL", 5, 120, source_transaction_id="buy-1"),
            ]
        )
        assert result["buy-1"] == 0.0

    def test_only_buy_ids_in_result(self):
        result = compute_lot_remaining_shares(
            [
                make_tx("buy-1", "BUY", 5, 100),
                make_tx("sell-1", "SELL", 2, 120, source_transaction_id="buy-1"),
            ]
        )
        assert "sell-1" not in result
        assert set(result.keys()) == {"buy-1"}
