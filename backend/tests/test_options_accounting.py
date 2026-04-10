from typing import Optional

from app.services.options_accounting import (
    annotate_option_transactions,
    calculate_option_accounting,
    preview_option_close,
)


def make_option_tx(
    tx_id: str,
    action: str,
    contracts: int,
    *,
    premium: Optional[float] = None,
    fees: float = 0.0,
    date: str = "2025-01-01",
    exchange_rate_to_czk: Optional[float] = None,
    portfolio_id: str = "p1",
    option_symbol: str = "AAPL250117C00150000",
) -> dict:
    return {
        "id": tx_id,
        "portfolio_id": portfolio_id,
        "option_symbol": option_symbol,
        "action": action,
        "contracts": contracts,
        "premium": premium,
        "fees": fees,
        "date": date,
        "exchange_rate_to_czk": exchange_rate_to_czk,
    }


class TestOptionsAccounting:
    def test_bto_fees_increase_open_long_basis(self):
        accounting = calculate_option_accounting(
            [
                make_option_tx(
                    "open-1",
                    "BTO",
                    2,
                    premium=1.5,
                    fees=4,
                    exchange_rate_to_czk=23,
                )
            ]
        )

        assert accounting.holding.position == "long"
        assert accounting.holding.contracts == 2
        assert accounting.holding.avg_premium == 1.52
        assert accounting.holding.total_cost == 304

    def test_sto_fees_reduce_open_short_credit(self):
        accounting = calculate_option_accounting(
            [
                make_option_tx(
                    "open-1",
                    "STO",
                    2,
                    premium=1.5,
                    fees=4,
                    exchange_rate_to_czk=23,
                )
            ]
        )

        assert accounting.holding.position == "short"
        assert accounting.holding.contracts == 2
        assert accounting.holding.avg_premium == 1.48
        assert accounting.holding.total_cost == 296

    def test_stc_realized_pl_includes_open_and_close_fees(self):
        accounting = calculate_option_accounting(
            [
                make_option_tx(
                    "open-1",
                    "BTO",
                    1,
                    premium=2.0,
                    fees=5,
                    date="2025-01-01",
                    exchange_rate_to_czk=24,
                ),
                make_option_tx(
                    "close-1",
                    "STC",
                    1,
                    premium=3.0,
                    fees=4,
                    date="2025-01-10",
                    exchange_rate_to_czk=25,
                ),
            ]
        )

        event = accounting.realized_events[0]
        assert event.realized_pl == 91
        assert event.realized_pl_czk == 2480

    def test_btc_realized_pl_includes_open_and_close_fees(self):
        accounting = calculate_option_accounting(
            [
                make_option_tx(
                    "open-1",
                    "STO",
                    1,
                    premium=3.0,
                    fees=5,
                    date="2025-01-01",
                    exchange_rate_to_czk=24,
                ),
                make_option_tx(
                    "close-1",
                    "BTC",
                    1,
                    premium=1.0,
                    fees=4,
                    date="2025-01-10",
                    exchange_rate_to_czk=25,
                ),
            ]
        )

        event = accounting.realized_events[0]
        assert event.realized_pl == 191
        assert event.realized_pl_czk == 4480

    def test_assignment_only_realizes_closing_fees_and_transfers_short_credit(self):
        preview = preview_option_close(
            [
                make_option_tx(
                    "open-1",
                    "STO",
                    1,
                    premium=2.0,
                    fees=5,
                    date="2025-01-01",
                    option_symbol="AAPL250117P00150000",
                )
            ],
            action="ASSIGNMENT",
            contracts=1,
            premium=None,
            fees=3,
            exchange_rate_to_czk=25,
        )

        assert preview is not None
        assert preview.position == "short"
        assert preview.realized_pl == -3
        assert preview.realized_pl_czk == -75
        assert preview.transferred_entry_per_share == 1.95

    def test_exercise_transfers_long_cost_basis_into_stock_economics(self):
        preview = preview_option_close(
            [
                make_option_tx(
                    "open-1",
                    "BTO",
                    1,
                    premium=2.0,
                    fees=5,
                    date="2025-01-01",
                    option_symbol="AAPL250117C00150000",
                )
            ],
            action="EXERCISE",
            contracts=1,
            premium=None,
            fees=3,
            exchange_rate_to_czk=25,
        )

        assert preview is not None
        assert preview.position == "long"
        assert preview.realized_pl == -3
        assert preview.realized_pl_czk == -75
        assert preview.transferred_entry_per_share == 2.05

    def test_annotation_exposes_fee_aware_option_fields(self):
        annotated = annotate_option_transactions(
            [
                make_option_tx(
                    "open-1",
                    "STO",
                    1,
                    premium=2.0,
                    fees=5,
                    date="2025-01-01",
                    exchange_rate_to_czk=24,
                ),
                make_option_tx(
                    "close-1",
                    "BTC",
                    1,
                    premium=1.0,
                    fees=4,
                    date="2025-01-10",
                    exchange_rate_to_czk=25,
                ),
            ]
        )

        opening = annotated[0]
        closing = annotated[1]

        assert opening["economic_amount"] == 195
        assert opening["net_cashflow"] == 195
        assert opening["net_cashflow_czk"] == 4680
        assert opening["realized_pl"] is None

        assert closing["gross_amount"] == 100
        assert closing["net_cashflow"] == -104
        assert closing["net_cashflow_czk"] == -2600
        assert closing["realized_pl"] == 91
        assert closing["realized_pl_czk"] == 2080
