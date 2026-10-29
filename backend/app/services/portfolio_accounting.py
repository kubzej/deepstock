from dataclasses import dataclass
from typing import Any, Optional


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


def holding_market_value_czk(
    shares: float, price: Optional[float], price_scale: float, fx_rate: float
) -> Optional[float]:
    """
    Market value of a position in CZK, or None while it has no live price: a missing
    quote is not a zero price, and callers leave such a position out of every total.
    """
    if price is None or price <= 0:
        return None
    return price * price_scale * shares * fx_rate


def require_czk_rate(currency: Optional[str], exchange_rate_to_czk: Optional[float]) -> None:
    """
    Refuse to store a foreign-currency amount without its CZK rate. The accounting would
    read the missing rate as 1, booking 100 USD as 100 CZK and distorting cost and P/L.
    """
    currency = (currency or "USD").upper()
    if currency != "CZK" and not exchange_rate_to_czk:
        raise ValueError(
            f"Chybí kurz k CZK pro měnu {currency}. Bez něj by se částka v Kč evidovala chybně."
        )


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


def calculate_stock_holding_history(transactions: list[dict]) -> list[HoldingCalculation]:
    """State of one position after each transaction, in input order.

    `transactions` are the transactions of a single (portfolio, stock) in execution
    order. This is the one FIFO / lot implementation behind the holdings table and
    the performance chart.
    """
    shares = 0.0
    total_cost = 0.0
    total_invested_czk = 0.0
    realized_pnl = 0.0
    buy_lots: list[BuyLot] = []
    history: list[HoldingCalculation] = []

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

        elif tx_type == "SELL":
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

        history.append(
            HoldingCalculation(
                shares=shares,
                total_cost=total_cost,
                total_invested_czk=total_invested_czk,
                realized_pnl=realized_pnl,
            )
        )

    return history


def calculate_stock_holding_totals(transactions: list[dict]) -> HoldingCalculation:
    history = calculate_stock_holding_history(transactions)
    if not history:
        return HoldingCalculation(
            shares=0.0, total_cost=0.0, total_invested_czk=0.0, realized_pnl=0.0
        )
    return history[-1]


def transaction_net_cashflow_czk(transaction: dict) -> float:
    """CZK moved by one stock transaction: negative for a buy (price + fees), positive for a sell (price - fees)."""
    tx_type = transaction["type"]
    if tx_type not in ("BUY", "SELL"):
        return 0.0

    rate = _get_transaction_rate(transaction)
    gross_czk = _get_transaction_gross_amount_czk(
        transaction, _get_transaction_gross_amount(transaction), rate
    )
    fees_czk = _as_float(transaction.get("fees")) * rate
    return -(gross_czk + fees_czk) if tx_type == "BUY" else gross_czk - fees_czk


def annotate_stock_transactions(transactions: list[dict]) -> list[dict]:
    """Annotate transactions with lot and P/L data, one position at a time.

    FIFO lots only make sense within a single (portfolio, stock) position, so
    mixed input is split into positions first and returned in input order.
    """
    positions: dict[tuple, list[dict]] = {}
    for tx in transactions:
        key = (tx.get("portfolio_id"), tx.get("stock_id"))
        positions.setdefault(key, []).append(tx)

    annotated_by_id: dict[str, dict] = {}
    for position_transactions in positions.values():
        for tx in _annotate_position_transactions(position_transactions):
            annotated_by_id[tx["id"]] = tx

    return [annotated_by_id[tx["id"]] for tx in transactions if tx.get("id") in annotated_by_id]


def _annotate_position_transactions(transactions: list[dict]) -> list[dict]:
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


_SHARES_EPSILON = 1e-6


def find_position_history_error(transactions: list[dict]) -> Optional[str]:
    """Return a user-facing error if one position's history is impossible, else None.

    Walks the position in the same order the annotation uses. Every sell must name
    a lot (BUY) of this position that already exists on the sell date and still
    has enough shares left. Expects the transactions of a single (portfolio, stock).
    """
    ordered = sorted(
        transactions,
        key=lambda tx: (
            tx.get("executed_at") or "",
            tx.get("created_at") or "",
            tx.get("id") or "",
        ),
    )
    buy_ids = {tx["id"] for tx in ordered if tx["type"] == "BUY"}
    lot_remaining: dict[str, float] = {}
    shares = 0.0

    for tx in ordered:
        tx_shares = _as_float(tx.get("shares"))
        if tx["type"] == "BUY":
            shares += tx_shares
            lot_remaining[tx["id"]] = tx_shares
            continue
        if tx["type"] != "SELL":
            continue

        sell_date = str(tx.get("executed_at") or "")[:10]
        source_id = tx.get("source_transaction_id")
        if not source_id:
            return "Prodej musí být navázaný na konkrétní lot."
        if source_id not in buy_ids:
            return "Vybraný lot neexistuje nebo nepatří k této akcii a portfoliu."
        if source_id not in lot_remaining:
            return f"Prodej k datu {sell_date} předchází nákupu, ze kterého se prodává."
        if tx_shares > lot_remaining[source_id] + _SHARES_EPSILON:
            return (
                f"Prodej k datu {sell_date} překračuje množství zbývající ve vybraném lotu "
                f"({max(lot_remaining[source_id], 0.0):g} ks)."
            )
        lot_remaining[source_id] -= tx_shares
        shares -= tx_shares
        if shares < -_SHARES_EPSILON:
            return (
                f"Prodej k datu {sell_date} by znamenal prodej akcií, které v ten den "
                f"ještě nebyly koupeny (chybí {-shares:g} ks)."
            )

    return None


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
