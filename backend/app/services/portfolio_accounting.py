from dataclasses import dataclass
from typing import Any


@dataclass
class BuyLot:
    id: str
    shares: float
    cost_per_share: float
    amount_czk_per_share: float


@dataclass
class HoldingCalculation:
    shares: float
    total_cost: float
    total_invested_czk: float
    realized_pnl: float


@dataclass
class EnrichedBuyLot:
    id: str
    shares: float
    cost_per_share: float
    amount_czk_per_share: float
    transaction: dict


def _as_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    return float(value)


def _get_transaction_rate(transaction: dict) -> float:
    return _as_float(transaction.get("exchange_rate_to_czk"), 1.0)


def _get_transaction_gross_amount(transaction: dict) -> float:
    total_amount = transaction.get("total_amount")
    if total_amount is not None:
        return float(total_amount)
    return _as_float(transaction.get("shares")) * _as_float(
        transaction.get("price_per_share")
    )


def _get_transaction_gross_amount_czk(
    transaction: dict, gross_amount: float, rate: float
) -> float:
    total_amount_czk = transaction.get("total_amount_czk")
    if total_amount_czk is not None:
        return float(total_amount_czk)
    return gross_amount * rate


def calculate_stock_holding_totals(transactions: list[dict]) -> HoldingCalculation:
    shares = 0.0
    total_cost = 0.0
    total_invested_czk = 0.0
    realized_pnl = 0.0
    buy_lots: list[BuyLot] = []

    for tx in transactions:
        tx_type = tx["type"]
        tx_shares = _as_float(tx.get("shares"))
        tx_fees = _as_float(tx.get("fees"))
        tx_rate = _get_transaction_rate(tx)
        tx_fees_czk = tx_fees * tx_rate
        tx_gross_amount = _get_transaction_gross_amount(tx)
        tx_gross_amount_czk = _get_transaction_gross_amount_czk(
            tx, tx_gross_amount, tx_rate
        )

        if tx_type == "BUY":
            economic_cost = tx_gross_amount + tx_fees
            economic_cost_czk = tx_gross_amount_czk + tx_fees_czk

            shares += tx_shares
            total_cost += economic_cost
            total_invested_czk += economic_cost_czk

            buy_lots.append(
                BuyLot(
                    id=tx["id"],
                    shares=tx_shares,
                    cost_per_share=economic_cost / tx_shares if tx_shares > 0 else 0.0,
                    amount_czk_per_share=(
                        economic_cost_czk / tx_shares if tx_shares > 0 else 0.0
                    ),
                )
            )
            continue

        if tx_type != "SELL":
            continue

        shares -= tx_shares

        shares_to_sell = tx_shares
        cost_of_sold = 0.0
        cost_of_sold_czk = 0.0
        source_tx_id = tx.get("source_transaction_id")

        if source_tx_id:
            for lot in buy_lots:
                if lot.id != source_tx_id:
                    continue

                sell_from_lot = min(lot.shares, shares_to_sell)
                cost_of_sold += sell_from_lot * lot.cost_per_share
                cost_of_sold_czk += sell_from_lot * lot.amount_czk_per_share
                lot.shares -= sell_from_lot
                shares_to_sell -= sell_from_lot
                break

        while shares_to_sell > 0 and buy_lots:
            lot = buy_lots[0]
            sell_from_lot = min(lot.shares, shares_to_sell)
            cost_of_sold += sell_from_lot * lot.cost_per_share
            cost_of_sold_czk += sell_from_lot * lot.amount_czk_per_share
            lot.shares -= sell_from_lot
            shares_to_sell -= sell_from_lot

            if lot.shares <= 0:
                buy_lots.pop(0)

        net_proceeds = tx_gross_amount - tx_fees
        realized_pnl += net_proceeds - cost_of_sold
        total_cost -= cost_of_sold
        total_invested_czk -= cost_of_sold_czk

        buy_lots = [lot for lot in buy_lots if lot.shares > 0]

    return HoldingCalculation(
        shares=shares,
        total_cost=total_cost,
        total_invested_czk=total_invested_czk,
        realized_pnl=realized_pnl,
    )


def annotate_stock_transactions(transactions: list[dict]) -> list[dict]:
    sorted_transactions = sorted(
        transactions,
        key=lambda tx: (
            tx.get("executed_at") or "",
            tx.get("created_at") or "",
            tx.get("id") or "",
        ),
    )

    buy_lots: list[EnrichedBuyLot] = []
    enriched: list[dict] = []

    for transaction in sorted_transactions:
        tx = dict(transaction)
        tx_shares = _as_float(tx.get("shares"))
        tx_fees = _as_float(tx.get("fees"))
        tx_rate = _as_float(tx.get("exchange_rate_to_czk"), 1.0)
        tx_fees_czk = tx_fees * tx_rate
        tx_gross_amount = _get_transaction_gross_amount(tx)
        tx_gross_amount_czk = _get_transaction_gross_amount_czk(
            tx, tx_gross_amount, tx_rate
        )

        tx["gross_amount"] = round(tx_gross_amount, 4)
        tx["gross_amount_czk"] = round(tx_gross_amount_czk, 4)
        tx["fee_czk"] = round(tx_fees_czk, 4)

        if tx["type"] == "BUY":
            economic_amount = tx_gross_amount + tx_fees
            economic_amount_czk = tx_gross_amount_czk + tx_fees_czk
            tx["economic_amount"] = round(economic_amount, 4)
            tx["economic_amount_czk"] = round(economic_amount_czk, 4)
            tx["net_cashflow"] = round(-economic_amount, 4)
            tx["net_cashflow_czk"] = round(-economic_amount_czk, 4)
            tx["remaining_shares"] = round(tx_shares, 6)
            tx["remaining_cost_basis"] = round(economic_amount, 4)
            tx["remaining_cost_basis_czk"] = round(economic_amount_czk, 4)
            tx["realized_pnl"] = None
            tx["realized_pnl_czk"] = None

            enriched.append(tx)
            buy_lots.append(
                EnrichedBuyLot(
                    id=tx["id"],
                    shares=tx_shares,
                    cost_per_share=economic_amount / tx_shares if tx_shares > 0 else 0.0,
                    amount_czk_per_share=(
                        economic_amount_czk / tx_shares if tx_shares > 0 else 0.0
                    ),
                    transaction=tx,
                )
            )
            continue

        shares_to_sell = tx_shares
        cost_of_sold = 0.0
        cost_of_sold_czk = 0.0
        source_tx_id = tx.get("source_transaction_id")

        if source_tx_id:
            for lot in buy_lots:
                if lot.id != source_tx_id or shares_to_sell <= 0:
                    continue
                sell_from_lot = min(lot.shares, shares_to_sell)
                cost_piece = sell_from_lot * lot.cost_per_share
                cost_piece_czk = sell_from_lot * lot.amount_czk_per_share
                cost_of_sold += cost_piece
                cost_of_sold_czk += cost_piece_czk
                lot.shares -= sell_from_lot
                shares_to_sell -= sell_from_lot
                lot.transaction["remaining_shares"] = round(lot.shares, 6)
                lot.transaction["remaining_cost_basis"] = round(
                    max(lot.shares * lot.cost_per_share, 0.0), 4
                )
                lot.transaction["remaining_cost_basis_czk"] = round(
                    max(lot.shares * lot.amount_czk_per_share, 0.0), 4
                )
                break

        while shares_to_sell > 0 and buy_lots:
            lot = buy_lots[0]
            sell_from_lot = min(lot.shares, shares_to_sell)
            cost_piece = sell_from_lot * lot.cost_per_share
            cost_piece_czk = sell_from_lot * lot.amount_czk_per_share
            cost_of_sold += cost_piece
            cost_of_sold_czk += cost_piece_czk
            lot.shares -= sell_from_lot
            shares_to_sell -= sell_from_lot
            lot.transaction["remaining_shares"] = round(lot.shares, 6)
            lot.transaction["remaining_cost_basis"] = round(
                max(lot.shares * lot.cost_per_share, 0.0), 4
            )
            lot.transaction["remaining_cost_basis_czk"] = round(
                max(lot.shares * lot.amount_czk_per_share, 0.0), 4
            )
            if lot.shares <= 0:
                buy_lots.pop(0)

        net_proceeds = tx_gross_amount - tx_fees
        net_proceeds_czk = tx_gross_amount_czk - tx_fees_czk
        tx["economic_amount"] = round(net_proceeds, 4)
        tx["economic_amount_czk"] = round(net_proceeds_czk, 4)
        tx["net_cashflow"] = round(net_proceeds, 4)
        tx["net_cashflow_czk"] = round(net_proceeds_czk, 4)
        tx["cost_basis_sold"] = round(cost_of_sold, 4)
        tx["cost_basis_sold_czk"] = round(cost_of_sold_czk, 4)
        tx["realized_pnl"] = round(net_proceeds - cost_of_sold, 4)
        tx["realized_pnl_czk"] = round(net_proceeds_czk - cost_of_sold_czk, 4)

        enriched.append(tx)

    by_id = {tx["id"]: tx for tx in enriched}
    return [by_id[tx["id"]] for tx in transactions if tx.get("id") in by_id]


def compute_lot_remaining_shares(transactions: list[dict]) -> dict[str, float]:
    """
    Return {buy_transaction_id: remaining_shares} for all BUY lots.

    Accounts for both linked sells (source_transaction_id set) and FIFO
    fallback sells (source_transaction_id is None). Requires the full
    transaction list for the position (buys AND sells) so the annotation
    engine can correctly consume sells against lots.
    """
    annotated = annotate_stock_transactions(transactions)
    return {
        tx["id"]: tx["remaining_shares"]
        for tx in annotated
        if tx["type"] == "BUY"
    }
