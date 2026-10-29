from typing import Optional

import pytest
from pydantic import ValidationError

from app.services.portfolio_accounting import (
    annotate_stock_transactions,
    calculate_stock_holding_history,
    calculate_stock_holding_totals,
    compute_lot_remaining_shares,
    find_position_history_error,
    transaction_net_cashflow_czk,
)
from app.schemas.portfolio import TransactionCreate, TransactionUpdate


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


def in_position(tx: dict, stock_id: str, executed_at: str, portfolio_id: str = "p1") -> dict:
    return {**tx, "stock_id": stock_id, "portfolio_id": portfolio_id, "executed_at": executed_at}


class TestAnnotationAcrossPositions:
    def test_sell_does_not_consume_lot_of_another_stock(self):
        annotated = annotate_stock_transactions(
            [
                in_position(make_tx("buy-a", "BUY", 1, 10), "A", "2026-01-01"),
                in_position(make_tx("buy-b", "BUY", 1, 100), "B", "2026-01-02"),
                in_position(make_tx("sell-b", "SELL", 1, 120), "B", "2026-01-03"),
            ]
        )
        by_id = {tx["id"]: tx for tx in annotated}

        assert by_id["sell-b"]["realized_pnl"] == 20
        assert by_id["sell-b"]["cost_basis_sold"] == 100
        assert by_id["buy-a"]["remaining_shares"] == 1
        assert by_id["buy-b"]["remaining_shares"] == 0

    def test_same_stock_in_two_portfolios_is_independent(self):
        annotated = annotate_stock_transactions(
            [
                in_position(make_tx("buy-1", "BUY", 5, 10), "A", "2026-01-01", "p1"),
                in_position(make_tx("buy-2", "BUY", 5, 50), "A", "2026-01-02", "p2"),
                in_position(make_tx("sell-2", "SELL", 5, 60), "A", "2026-01-03", "p2"),
            ]
        )
        by_id = {tx["id"]: tx for tx in annotated}

        assert by_id["sell-2"]["realized_pnl"] == 50
        assert by_id["buy-1"]["remaining_shares"] == 5
        assert by_id["buy-2"]["remaining_shares"] == 0

    def test_partial_sell_from_chosen_lot_leaves_other_lots_alone(self):
        annotated = annotate_stock_transactions(
            [
                in_position(make_tx("a-old", "BUY", 10, 10), "A", "2026-01-01"),
                in_position(make_tx("a-new", "BUY", 10, 20), "A", "2026-01-02"),
                in_position(make_tx("b-1", "BUY", 3, 5), "B", "2026-01-02"),
                in_position(
                    make_tx("sell-a", "SELL", 4, 30, source_transaction_id="a-new"),
                    "A",
                    "2026-01-03",
                ),
                in_position(make_tx("sell-b", "SELL", 1, 7), "B", "2026-01-03"),
            ]
        )
        by_id = {tx["id"]: tx for tx in annotated}

        assert by_id["sell-a"]["cost_basis_sold"] == 80
        assert by_id["sell-a"]["realized_pnl"] == 40
        assert by_id["a-new"]["remaining_shares"] == 6
        assert by_id["a-old"]["remaining_shares"] == 10
        assert by_id["sell-b"]["realized_pnl"] == 2
        assert by_id["b-1"]["remaining_shares"] == 2

    def test_sell_larger_than_chosen_lot_continues_fifo_within_position(self):
        annotated = annotate_stock_transactions(
            [
                in_position(make_tx("a-old", "BUY", 10, 10), "A", "2026-01-01"),
                in_position(make_tx("a-new", "BUY", 5, 20), "A", "2026-01-02"),
                in_position(make_tx("b-1", "BUY", 10, 1), "B", "2026-01-01"),
                in_position(
                    make_tx("sell-a", "SELL", 7, 30, source_transaction_id="a-new"),
                    "A",
                    "2026-01-03",
                ),
            ]
        )
        by_id = {tx["id"]: tx for tx in annotated}

        # 5 from the chosen lot (5 * 20) + 2 FIFO from the oldest lot of the same stock (2 * 10)
        assert by_id["sell-a"]["cost_basis_sold"] == 120
        assert by_id["a-new"]["remaining_shares"] == 0
        assert by_id["a-old"]["remaining_shares"] == 8
        assert by_id["b-1"]["remaining_shares"] == 10

    def test_output_keeps_input_order(self):
        transactions = [
            in_position(make_tx("sell-b", "SELL", 1, 120), "B", "2026-01-03"),
            in_position(make_tx("buy-a", "BUY", 1, 10), "A", "2026-01-01"),
            in_position(make_tx("buy-b", "BUY", 1, 100), "B", "2026-01-02"),
        ]

        annotated = annotate_stock_transactions(transactions)

        assert [tx["id"] for tx in annotated] == ["sell-b", "buy-a", "buy-b"]


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


class TestTransactionInputValidation:
    BASE = {
        "stock_ticker": "AAPL",
        "type": "BUY",
        "shares": 1,
        "price_per_share": 10,
        "executed_at": "2026-01-01T00:00:00Z",
    }

    def test_valid_transaction_is_accepted_and_type_case_is_kept(self):
        tx = TransactionCreate(**{**self.BASE, "type": "sell", "fees": 0, "exchange_rate_to_czk": 22})
        assert tx.type == "sell"

    @pytest.mark.parametrize(
        "override",
        [
            {"shares": 0},
            {"shares": -1},
            {"price_per_share": 0},
            {"price_per_share": -5},
            {"fees": -1},
            {"exchange_rate_to_czk": 0},
            {"exchange_rate_to_czk": -22},
            {"type": "HOLD"},
        ],
    )
    def test_invalid_values_are_rejected(self, override):
        with pytest.raises(ValidationError):
            TransactionCreate(**{**self.BASE, **override})

    def test_update_rejects_non_positive_values_but_allows_omitted_fields(self):
        assert TransactionUpdate().shares is None
        with pytest.raises(ValidationError):
            TransactionUpdate(shares=0)
        with pytest.raises(ValidationError):
            TransactionUpdate(fees=-1)


def dated(tx: dict, executed_at: str, created_at: str = "2026-01-01T00:00:00+00:00") -> dict:
    return {**tx, "executed_at": executed_at, "created_at": created_at}


class TestPositionHistoryValidation:
    def test_valid_history_has_no_error(self):
        history = [
            dated(make_tx("buy-1", "BUY", 10, 10), "2026-01-01T00:00:00+00:00"),
            dated(make_tx("buy-2", "BUY", 5, 11), "2026-01-02T00:00:00+00:00"),
            dated(make_tx("sell-1", "SELL", 4, 12, source_transaction_id="buy-1"), "2026-02-01T00:00:00+00:00"),
            dated(make_tx("sell-2", "SELL", 6, 12, source_transaction_id="buy-1"), "2026-03-01T00:00:00+00:00"),
            dated(make_tx("sell-3", "SELL", 2, 12, source_transaction_id="buy-2"), "2026-03-02T00:00:00+00:00"),
        ]
        assert find_position_history_error(history) is None

    def test_sell_without_lot_is_rejected(self):
        history = [
            dated(make_tx("buy-1", "BUY", 10, 10), "2026-01-01T00:00:00+00:00"),
            dated(make_tx("sell-1", "SELL", 4, 12), "2026-02-01T00:00:00+00:00"),
        ]
        assert find_position_history_error(history) is not None

    def test_sell_from_lot_of_another_position_is_rejected(self):
        # "buy-other" is not part of this position's transactions
        history = [
            dated(make_tx("buy-1", "BUY", 10, 10), "2026-01-01T00:00:00+00:00"),
            dated(make_tx("sell-1", "SELL", 4, 12, source_transaction_id="buy-other"), "2026-02-01T00:00:00+00:00"),
        ]
        assert "nepatří" in find_position_history_error(history)

    def test_sell_from_a_sell_id_is_rejected(self):
        history = [
            dated(make_tx("buy-1", "BUY", 10, 10), "2026-01-01T00:00:00+00:00"),
            dated(make_tx("sell-1", "SELL", 2, 12, source_transaction_id="buy-1"), "2026-02-01T00:00:00+00:00"),
            dated(make_tx("sell-2", "SELL", 2, 12, source_transaction_id="sell-1"), "2026-02-02T00:00:00+00:00"),
        ]
        assert find_position_history_error(history) is not None

    def test_sell_larger_than_lot_is_rejected_even_if_other_lots_have_shares(self):
        history = [
            dated(make_tx("buy-1", "BUY", 5, 10), "2026-01-01T00:00:00+00:00"),
            dated(make_tx("buy-2", "BUY", 50, 10), "2026-01-02T00:00:00+00:00"),
            dated(make_tx("sell-1", "SELL", 6, 12, source_transaction_id="buy-1"), "2026-02-01T00:00:00+00:00"),
        ]
        error = find_position_history_error(history)
        assert error is not None and "5 ks" in error

    def test_second_sell_cannot_exceed_what_is_left_in_the_lot(self):
        history = [
            dated(make_tx("buy-1", "BUY", 10, 10), "2026-01-01T00:00:00+00:00"),
            dated(make_tx("sell-1", "SELL", 7, 12, source_transaction_id="buy-1"), "2026-02-01T00:00:00+00:00"),
            dated(make_tx("sell-2", "SELL", 4, 12, source_transaction_id="buy-1"), "2026-02-02T00:00:00+00:00"),
        ]
        error = find_position_history_error(history)
        assert error is not None and "3 ks" in error

    def test_sell_dated_before_its_lot_is_rejected(self):
        history = [
            dated(make_tx("buy-1", "BUY", 10, 10), "2026-02-01T00:00:00+00:00"),
            dated(make_tx("sell-1", "SELL", 5, 12, source_transaction_id="buy-1"), "2026-01-01T00:00:00+00:00"),
        ]
        error = find_position_history_error(history)
        assert error is not None and "2026-01-01" in error

    def test_sell_dated_before_its_lot_is_rejected_even_when_other_lots_exist(self):
        history = [
            dated(make_tx("buy-1", "BUY", 10, 10), "2026-01-01T00:00:00+00:00"),
            dated(make_tx("buy-2", "BUY", 10, 11), "2026-03-01T00:00:00+00:00"),
            dated(make_tx("sell-1", "SELL", 2, 12, source_transaction_id="buy-2"), "2026-02-01T00:00:00+00:00"),
        ]
        assert find_position_history_error(history) is not None

    def test_same_day_sell_created_after_buy_is_allowed(self):
        history = [
            dated(make_tx("buy-1", "BUY", 5, 10), "2026-01-01T00:00:00+00:00", "2026-01-01T09:00:00+00:00"),
            dated(
                make_tx("sell-1", "SELL", 5, 12, source_transaction_id="buy-1"),
                "2026-01-01T00:00:00+00:00",
                "2026-01-01T10:00:00+00:00",
            ),
        ]
        assert find_position_history_error(history) is None

    def test_selling_a_whole_lot_with_decimal_shares_is_allowed(self):
        history = [
            dated(make_tx("buy-1", "BUY", 0.3, 10), "2026-01-01T00:00:00+00:00"),
            dated(make_tx("buy-2", "BUY", 0.6, 10), "2026-01-02T00:00:00+00:00"),
            dated(make_tx("sell-1", "SELL", 0.3, 12, source_transaction_id="buy-1"), "2026-01-03T00:00:00+00:00"),
            dated(make_tx("sell-2", "SELL", 0.6, 12, source_transaction_id="buy-2"), "2026-01-03T00:00:01+00:00"),
        ]
        assert find_position_history_error(history) is None


class TestStockHoldingHistory:
    def history_input(self):
        return [
            make_tx("buy-1", "BUY", 10, 100, fees=5, exchange_rate_to_czk=24),
            make_tx("buy-2", "BUY", 10, 120, exchange_rate_to_czk=25),
            make_tx("sell-1", "SELL", 4, 130, fees=2, exchange_rate_to_czk=26, source_transaction_id="buy-2"),
            make_tx("sell-2", "SELL", 12, 140, exchange_rate_to_czk=27),
        ]

    def test_state_after_each_transaction(self):
        history = calculate_stock_holding_history(self.history_input())

        assert [h.shares for h in history] == [10, 20, 16, 4]
        assert history[0].total_invested_czk == (1000 + 5) * 24
        # second lot 4 of 10 sold: cost left = first lot + 6 of the second
        assert history[2].total_invested_czk == pytest.approx((1000 + 5) * 24 + 6 * 120 * 25)

    def test_last_state_is_what_the_holdings_totals_return(self):
        transactions = self.history_input()

        assert calculate_stock_holding_history(transactions)[-1] == calculate_stock_holding_totals(transactions)

    def test_every_prefix_matches_the_totals_of_that_prefix(self):
        transactions = self.history_input()
        history = calculate_stock_holding_history(transactions)

        for index, state in enumerate(history):
            assert state == calculate_stock_holding_totals(transactions[: index + 1])

    def test_no_transactions_give_an_empty_history_and_zero_totals(self):
        assert calculate_stock_holding_history([]) == []
        assert calculate_stock_holding_totals([]).shares == 0

    def test_transaction_of_another_type_changes_nothing(self):
        history = calculate_stock_holding_history(
            [make_tx("buy-1", "BUY", 1, 100), {**make_tx("x", "DIVIDEND", 1, 5)}]
        )

        assert history[0] == history[1]


class TestTransactionNetCashflow:
    @pytest.mark.parametrize(
        "transaction, expected",
        [
            (make_tx("b", "BUY", 10, 100, fees=5, exchange_rate_to_czk=24), -(1000 + 5) * 24),
            (make_tx("s", "SELL", 10, 120, fees=5, exchange_rate_to_czk=24), (1200 - 5) * 24),
            (make_tx("b", "BUY", 10, 100), -1000),
            (make_tx("d", "DIVIDEND", 1, 5), 0),
        ],
    )
    def test_cash_moved_by_one_transaction(self, transaction, expected):
        assert transaction_net_cashflow_czk(transaction) == expected

    def test_agrees_with_the_annotation_used_on_the_transaction_history(self):
        transactions = [
            make_tx("buy-1", "BUY", 10, 100, fees=5, exchange_rate_to_czk=24),
            make_tx("sell-1", "SELL", 4, 120, fees=3, exchange_rate_to_czk=25),
        ]

        annotated = annotate_stock_transactions(transactions)

        for original, enriched in zip(transactions, annotated):
            assert transaction_net_cashflow_czk(original) == pytest.approx(enriched["net_cashflow_czk"])
