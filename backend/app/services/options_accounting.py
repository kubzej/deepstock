from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class OptionLot:
    position: str
    contracts: int
    amount_per_contract: float
    amount_czk_per_contract: float


@dataclass
class OptionHoldingSnapshot:
    position: Optional[str]
    contracts: int
    avg_premium: Optional[float]
    total_cost: float


@dataclass
class OptionRealizedEvent:
    transaction_id: Optional[str]
    action: str
    date: str
    realized_pl: float
    realized_pl_czk: float


@dataclass
class OptionClosePreview:
    position: str
    contracts: int
    realized_pl: float
    realized_pl_czk: float
    transferred_entry_per_share: float


@dataclass
class OptionAccountingResult:
    holding: OptionHoldingSnapshot
    realized_events: list[OptionRealizedEvent]
    open_lots: list[OptionLot]


def _as_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    return float(value)


def _as_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    return int(value)


def _tx_sort_key(transaction: dict) -> tuple:
    return (
        transaction.get("date") or "",
        transaction.get("created_at") or "",
        transaction.get("id") or "",
    )


def _clone_lots(lots: list[OptionLot]) -> list[OptionLot]:
    return [
        OptionLot(
            position=lot.position,
            contracts=lot.contracts,
            amount_per_contract=lot.amount_per_contract,
            amount_czk_per_contract=lot.amount_czk_per_contract,
        )
        for lot in lots
    ]


def _opening_position_for_action(action: str) -> Optional[str]:
    if action == "BTO":
        return "long"
    if action == "STO":
        return "short"
    return None


def _closing_position_for_action(
    action: str, open_lots: list[OptionLot]
) -> Optional[str]:
    if action in {"STC", "EXERCISE"}:
        return "long"
    if action in {"BTC", "ASSIGNMENT"}:
        return "short"
    if action == "EXPIRATION":
        if any(lot.position == "short" and lot.contracts > 0 for lot in open_lots):
            return "short"
        if any(lot.position == "long" and lot.contracts > 0 for lot in open_lots):
            return "long"
    return None


def _consume_lots(
    open_lots: list[OptionLot], position: str, contracts: int
) -> tuple[int, float, float]:
    remaining_contracts = contracts
    consumed_contracts = 0
    consumed_amount = 0.0
    consumed_amount_czk = 0.0

    for lot in open_lots:
        if remaining_contracts <= 0:
            break
        if lot.position != position or lot.contracts <= 0:
            continue

        close_count = min(lot.contracts, remaining_contracts)
        consumed_contracts += close_count
        consumed_amount += close_count * lot.amount_per_contract
        consumed_amount_czk += close_count * lot.amount_czk_per_contract
        lot.contracts -= close_count
        remaining_contracts -= close_count

    open_lots[:] = [lot for lot in open_lots if lot.contracts > 0]
    return consumed_contracts, consumed_amount, consumed_amount_czk


def _build_opening_lot(transaction: dict) -> Optional[OptionLot]:
    action = transaction["action"]
    position = _opening_position_for_action(action)
    if position is None:
        return None

    contracts = _as_int(transaction.get("contracts"))
    premium = _as_float(transaction.get("premium"))
    fees = _as_float(transaction.get("fees"))
    rate = _as_float(transaction.get("exchange_rate_to_czk"), 1.0)
    gross_amount = premium * contracts * 100
    fees_czk = fees * rate

    if position == "long":
        total_amount = gross_amount + fees
        total_amount_czk = gross_amount * rate + fees_czk
    else:
        total_amount = gross_amount - fees
        total_amount_czk = gross_amount * rate - fees_czk

    return OptionLot(
        position=position,
        contracts=contracts,
        amount_per_contract=total_amount / contracts if contracts > 0 else 0.0,
        amount_czk_per_contract=(
            total_amount_czk / contracts if contracts > 0 else 0.0
        ),
    )


def _preview_close_on_lots(
    open_lots: list[OptionLot],
    *,
    action: str,
    contracts: int,
    premium: Optional[float],
    fees: float,
    exchange_rate_to_czk: Optional[float],
) -> Optional[OptionClosePreview]:
    position = _closing_position_for_action(action, open_lots)
    if position is None:
        return None

    consumed_contracts, entry_amount, entry_amount_czk = _consume_lots(
        open_lots, position, contracts
    )
    if consumed_contracts <= 0:
        return None

    closing_premium = _as_float(premium)
    closing_rate = _as_float(exchange_rate_to_czk, 1.0)
    closing_fees = _as_float(fees)
    closing_fees_czk = closing_fees * closing_rate
    closing_gross = closing_premium * consumed_contracts * 100
    closing_gross_czk = closing_gross * closing_rate

    if action == "STC":
        realized_pl = (closing_gross - closing_fees) - entry_amount
        realized_pl_czk = (closing_gross_czk - closing_fees_czk) - entry_amount_czk
    elif action == "BTC":
        realized_pl = entry_amount - (closing_gross + closing_fees)
        realized_pl_czk = entry_amount_czk - (closing_gross_czk + closing_fees_czk)
    elif action == "EXPIRATION":
        if position == "short":
            realized_pl = entry_amount - closing_fees
            realized_pl_czk = entry_amount_czk - closing_fees_czk
        else:
            realized_pl = -entry_amount - closing_fees
            realized_pl_czk = -entry_amount_czk - closing_fees_czk
    elif action in {"ASSIGNMENT", "EXERCISE"}:
        realized_pl = -closing_fees
        realized_pl_czk = -closing_fees_czk
    else:
        return None

    transferred_entry_per_share = entry_amount / (consumed_contracts * 100)

    return OptionClosePreview(
        position=position,
        contracts=consumed_contracts,
        realized_pl=realized_pl,
        realized_pl_czk=realized_pl_czk,
        transferred_entry_per_share=transferred_entry_per_share,
    )


def calculate_option_accounting(transactions: list[dict]) -> OptionAccountingResult:
    sorted_transactions = sorted(transactions, key=_tx_sort_key)
    open_lots: list[OptionLot] = []
    realized_events: list[OptionRealizedEvent] = []

    for transaction in sorted_transactions:
        opening_lot = _build_opening_lot(transaction)
        if opening_lot is not None:
            open_lots.append(opening_lot)
            continue

        action = transaction["action"]
        preview = _preview_close_on_lots(
            open_lots,
            action=action,
            contracts=_as_int(transaction.get("contracts")),
            premium=transaction.get("premium"),
            fees=_as_float(transaction.get("fees")),
            exchange_rate_to_czk=transaction.get("exchange_rate_to_czk"),
        )
        if preview is None:
            continue

        realized_events.append(
            OptionRealizedEvent(
                transaction_id=transaction.get("id"),
                action=action,
                date=transaction.get("date") or "",
                realized_pl=preview.realized_pl,
                realized_pl_czk=preview.realized_pl_czk,
            )
        )

    long_lots = [lot for lot in open_lots if lot.position == "long" and lot.contracts > 0]
    short_lots = [lot for lot in open_lots if lot.position == "short" and lot.contracts > 0]

    if long_lots:
        total_contracts = sum(lot.contracts for lot in long_lots)
        total_cost = sum(lot.contracts * lot.amount_per_contract for lot in long_lots)
        holding = OptionHoldingSnapshot(
            position="long",
            contracts=total_contracts,
            avg_premium=(total_cost / total_contracts / 100) if total_contracts > 0 else None,
            total_cost=total_cost,
        )
    elif short_lots:
        total_contracts = sum(lot.contracts for lot in short_lots)
        total_credit = sum(
            lot.contracts * lot.amount_per_contract for lot in short_lots
        )
        holding = OptionHoldingSnapshot(
            position="short",
            contracts=total_contracts,
            avg_premium=(
                total_credit / total_contracts / 100 if total_contracts > 0 else None
            ),
            total_cost=total_credit,
        )
    else:
        holding = OptionHoldingSnapshot(
            position=None,
            contracts=0,
            avg_premium=None,
            total_cost=0.0,
        )

    return OptionAccountingResult(
        holding=holding,
        realized_events=realized_events,
        open_lots=_clone_lots(open_lots),
    )


def annotate_option_transactions(transactions: list[dict]) -> list[dict]:
    sorted_transactions = sorted(transactions, key=_tx_sort_key)
    open_lots: list[OptionLot] = []
    enriched: list[dict] = []

    for transaction in sorted_transactions:
        tx = dict(transaction)
        contracts = _as_int(tx.get("contracts"))
        premium = _as_float(tx.get("premium"))
        fees = _as_float(tx.get("fees"))
        rate = _as_float(tx.get("exchange_rate_to_czk"), 1.0)
        gross_amount = premium * contracts * 100
        gross_amount_czk = gross_amount * rate
        fees_czk = fees * rate

        tx["gross_amount"] = round(gross_amount, 4)
        tx["gross_amount_czk"] = round(gross_amount_czk, 4)
        tx["fee_czk"] = round(fees_czk, 4)

        opening_lot = _build_opening_lot(tx)
        if opening_lot is not None:
            if opening_lot.position == "long":
                economic_amount = gross_amount + fees
                economic_amount_czk = gross_amount_czk + fees_czk
                net_cashflow = -economic_amount
                net_cashflow_czk = -economic_amount_czk
            else:
                economic_amount = gross_amount - fees
                economic_amount_czk = gross_amount_czk - fees_czk
                net_cashflow = economic_amount
                net_cashflow_czk = economic_amount_czk

            tx["economic_amount"] = round(economic_amount, 4)
            tx["economic_amount_czk"] = round(economic_amount_czk, 4)
            tx["net_cashflow"] = round(net_cashflow, 4)
            tx["net_cashflow_czk"] = round(net_cashflow_czk, 4)
            tx["realized_pl"] = None
            tx["realized_pl_czk"] = None
            tx["transferred_entry_per_share"] = None

            open_lots.append(opening_lot)
            enriched.append(tx)
            continue

        preview = _preview_close_on_lots(
            open_lots,
            action=tx["action"],
            contracts=contracts,
            premium=tx.get("premium"),
            fees=fees,
            exchange_rate_to_czk=tx.get("exchange_rate_to_czk"),
        )

        if tx["action"] == "STC":
            net_cashflow = gross_amount - fees
            net_cashflow_czk = gross_amount_czk - fees_czk
        elif tx["action"] == "BTC":
            net_cashflow = -(gross_amount + fees)
            net_cashflow_czk = -(gross_amount_czk + fees_czk)
        else:
            net_cashflow = -fees
            net_cashflow_czk = -fees_czk

        tx["economic_amount"] = round(abs(net_cashflow), 4)
        tx["economic_amount_czk"] = round(abs(net_cashflow_czk), 4)
        tx["net_cashflow"] = round(net_cashflow, 4)
        tx["net_cashflow_czk"] = round(net_cashflow_czk, 4)
        tx["realized_pl"] = round(preview.realized_pl, 4) if preview else None
        tx["realized_pl_czk"] = (
            round(preview.realized_pl_czk, 4) if preview else None
        )
        tx["transferred_entry_per_share"] = (
            round(preview.transferred_entry_per_share, 6) if preview else None
        )

        enriched.append(tx)

    by_id = {tx["id"]: tx for tx in enriched}
    return [by_id[tx["id"]] for tx in transactions if tx.get("id") in by_id]


def preview_option_close(
    transactions: list[dict],
    *,
    action: str,
    contracts: int,
    premium: Optional[float],
    fees: float,
    exchange_rate_to_czk: Optional[float],
) -> Optional[OptionClosePreview]:
    open_lots = calculate_option_accounting(transactions=transactions).open_lots
    return _preview_close_on_lots(
        open_lots,
        action=action,
        contracts=contracts,
        premium=premium,
        fees=fees,
        exchange_rate_to_czk=exchange_rate_to_czk,
    )
