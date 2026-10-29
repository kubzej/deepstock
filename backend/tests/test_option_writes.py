"""Assignment/exercise writes a stock transaction and an option closing; they stand or fall together."""
from datetime import date

import pytest
from pydantic import ValidationError

from app.services import options as options_module
from app.services import portfolio as portfolio_module
from app.services.options import OptionsService
from app.services.portfolio import PortfolioService
from tests.fake_supabase import FakeSupabase
from app.schemas.options import OptionTransactionCreate

OPTION_SYMBOL = "AAPL250117P00150000"

HOLDING = {
    "portfolio_id": "p1",
    "symbol": "AAPL",
    "option_symbol": OPTION_SYMBOL,
    "option_type": "put",
    "strike_price": 150,
    "expiration_date": "2025-01-17",
    "position": "short",
    "contracts": 1,
    "avg_premium": 2,
    "currency": "USD",
}

OPENING = {
    "id": "opt-1",
    "portfolio_id": "p1",
    "option_symbol": OPTION_SYMBOL,
    "action": "STO",
    "contracts": 1,
    "premium": 2,
    "fees": 0,
    "date": "2025-01-01",
    "exchange_rate_to_czk": None,
}


@pytest.fixture
def env(monkeypatch):
    db = FakeSupabase()
    monkeypatch.setattr(options_module, "supabase", db)
    monkeypatch.setattr(portfolio_module, "supabase", db)

    class Env:
        pass

    result = Env()
    recalculations = []
    stock_service = portfolio_module.stock_service

    async def get_or_create(*_args, **_kwargs):
        return {"id": "stock-1", "ticker": "AAPL"}

    async def recalc(self, portfolio_id, stock_id):
        recalculations.append((portfolio_id, stock_id))

    async def holdings(*_args, **_kwargs):
        return [dict(result.holding)]

    async def transactions(*_args, **_kwargs):
        return [dict(OPENING)]

    async def annotate(_self, rows):
        return rows

    monkeypatch.setattr(stock_service, "get_or_create", get_or_create)
    monkeypatch.setattr(PortfolioService, "_recalculate_holding", recalc)
    monkeypatch.setattr(OptionsService, "get_holdings", lambda self, *a, **k: holdings())
    monkeypatch.setattr(OptionsService, "_get_transactions_for_symbols", lambda self, *a, **k: transactions())
    monkeypatch.setattr(OptionsService, "_annotate_transactions", annotate)

    result.holding = dict(HOLDING)
    result.db = db
    result.recalculations = recalculations
    result.service = OptionsService()
    return result


async def assign(env):
    return await env.service.close_position(
        portfolio_id="p1",
        option_symbol=OPTION_SYMBOL,
        closing_action="ASSIGNMENT",
        contracts=1,
        premium=None,
        close_date=date(2025, 1, 17),
        exchange_rate_to_czk=22.0,
    )


async def test_assignment_stores_stock_transaction_linked_to_the_closing(env):
    option_tx, stock_tx = await assign(env)

    assert len(env.db.tables["transactions"]) == 1
    assert env.db.tables["option_transactions"][0]["linked_stock_tx_id"] == stock_tx["id"]
    assert stock_tx["type"] == "BUY" and stock_tx["shares"] == 100


async def test_failed_option_closing_takes_back_the_stock_transaction(env):
    env.db.failures[("option_transactions", "insert")] = RuntimeError("supabase unavailable")

    with pytest.raises(RuntimeError, match="supabase unavailable"):
        await assign(env)

    assert env.db.tables["transactions"] == []
    assert env.db.tables.get("option_transactions", []) == []
    # holding recalculated after the insert and again after the stock transaction was discarded
    assert env.recalculations == [("p1", "stock-1"), ("p1", "stock-1")]


async def test_failed_discard_does_not_mask_the_original_error(env):
    env.db.failures[("option_transactions", "insert")] = RuntimeError("supabase unavailable")
    env.db.failures[("transactions", "delete")] = RuntimeError("delete failed too")

    with pytest.raises(RuntimeError, match="supabase unavailable"):
        await assign(env)


async def test_closing_without_stock_side_has_nothing_to_take_back(env):
    env.db.failures[("option_transactions", "insert")] = RuntimeError("supabase unavailable")

    with pytest.raises(RuntimeError, match="supabase unavailable"):
        await env.service.close_position(
            portfolio_id="p1",
            option_symbol=OPTION_SYMBOL,
            closing_action="BTC",
            contracts=1,
            premium=1,
            close_date=date(2025, 1, 10),
            exchange_rate_to_czk=22.0,
        )

    assert env.db.tables.get("transactions", []) == []
    assert env.recalculations == []


SHORT_CALL = {**HOLDING, "option_type": "call", "option_symbol": "AAPL250117C00150000"}


def seed_lot(env, lot_id="lot-1", shares=100, executed_at="2025-01-02T00:00:00+00:00", stock_id="stock-1"):
    env.db.tables.setdefault("transactions", []).append(
        {
            "id": lot_id,
            "portfolio_id": "p1",
            "stock_id": stock_id,
            "type": "BUY",
            "shares": shares,
            "price_per_share": 100,
            "executed_at": executed_at,
            "created_at": "2025-01-02T00:00:00+00:00",
        }
    )


async def assign_call(env, *, contracts=1, lot_id="lot-1", close_date=date(2025, 1, 17)):
    env.holding = {**SHORT_CALL, "contracts": contracts}
    return await env.service.close_position(
        portfolio_id="p1",
        option_symbol=SHORT_CALL["option_symbol"],
        closing_action="ASSIGNMENT",
        contracts=contracts,
        premium=None,
        close_date=close_date,
        source_transaction_id=lot_id,
        exchange_rate_to_czk=22.0,
    )


class TestAssignmentSellsFromChosenLot:
    async def test_sells_from_the_chosen_lot(self, env):
        seed_lot(env, shares=100)

        _, stock_tx = await assign_call(env)

        assert stock_tx["type"] == "SELL" and stock_tx["source_transaction_id"] == "lot-1"
        assert len(env.db.tables["option_transactions"]) == 1

    async def test_lot_with_too_few_shares_is_rejected_and_nothing_is_written(self, env):
        seed_lot(env, shares=100)

        with pytest.raises(ValueError, match="100 ks"):
            await assign_call(env, contracts=2)

        assert len(env.db.tables["transactions"]) == 1  # only the seeded lot
        assert env.db.tables.get("option_transactions", []) == []
        assert env.recalculations == []

    async def test_lot_of_another_stock_is_rejected(self, env):
        seed_lot(env, stock_id="stock-2")

        with pytest.raises(ValueError):
            await assign_call(env)

        assert env.db.tables.get("option_transactions", []) == []

    async def test_lot_bought_after_the_settlement_date_is_rejected(self, env):
        seed_lot(env, executed_at="2025-02-01T00:00:00+00:00")

        with pytest.raises(ValueError, match="předchází"):
            await assign_call(env)

    async def test_lot_bought_on_the_settlement_day_is_accepted(self, env):
        seed_lot(env, executed_at="2025-01-17T00:00:00+00:00")

        _, stock_tx = await assign_call(env)

        assert stock_tx["type"] == "SELL"

    async def test_second_settlement_cannot_reuse_shares_already_sold_from_the_lot(self, env):
        seed_lot(env, shares=100)
        await assign_call(env)

        with pytest.raises(ValueError, match="0 ks"):
            await assign_call(env)


class TestOpeningTransactionModel:
    BASE = {
        "symbol": "AAPL",
        "option_type": "call",
        "strike_price": 150,
        "expiration_date": "2025-01-17",
        "contracts": 1,
        "premium": 2,
        "date": "2025-01-01",
    }

    @pytest.mark.parametrize("action", ["BTO", "STO"])
    def test_opening_actions_are_accepted(self, action):
        assert OptionTransactionCreate(**self.BASE, action=action).action == action

    @pytest.mark.parametrize("action", ["STC", "BTC", "EXPIRATION", "ASSIGNMENT", "EXERCISE"])
    def test_closing_actions_must_go_through_close_position(self, action):
        with pytest.raises(ValidationError):
            OptionTransactionCreate(**self.BASE, action=action)

    @pytest.mark.parametrize("premium", [None, "missing"])
    def test_opening_requires_a_premium(self, premium):
        data = {k: v for k, v in self.BASE.items() if k != "premium"}
        if premium is None:
            data["premium"] = None

        with pytest.raises(ValidationError):
            OptionTransactionCreate(**data, action="STO")

    def test_opening_accepts_a_zero_premium(self):
        assert OptionTransactionCreate(**{**self.BASE, "premium": 0}, action="STO").premium == 0


async def close(env, action, *, contracts=1, premium=1, option_symbol=None):
    return await env.service.close_position(
        portfolio_id="p1",
        option_symbol=option_symbol or env.holding["option_symbol"],
        closing_action=action,
        contracts=contracts,
        premium=premium,
        close_date=date(2025, 1, 10),
        exchange_rate_to_czk=22.0,
    )


class TestClosingIsValidatedAgainstThePosition:
    @pytest.mark.parametrize("position, action", [("short", "STC"), ("short", "EXERCISE"), ("long", "BTC"), ("long", "ASSIGNMENT")])
    async def test_action_must_fit_the_position(self, env, position, action):
        env.holding["position"] = position

        with pytest.raises(ValueError, match="Invalid closing action"):
            await close(env, action)

        assert env.db.tables.get("option_transactions", []) == []

    @pytest.mark.parametrize("action", ["BTC", "EXPIRATION"])
    async def test_fitting_action_is_stored(self, env, action):
        await close(env, action)

        assert len(env.db.tables["option_transactions"]) == 1

    async def test_cannot_close_more_contracts_than_are_open(self, env):
        with pytest.raises(ValueError, match="only 1 open"):
            await close(env, "BTC", contracts=2)

        assert env.db.tables.get("option_transactions", []) == []

    async def test_unknown_position_cannot_be_closed(self, env):
        with pytest.raises(ValueError, match="No open position"):
            await close(env, "BTC", option_symbol="AAPL250117P00999000")

    async def test_selling_shares_on_assignment_needs_a_lot(self, env):
        env.holding = {**SHORT_CALL}

        with pytest.raises(ValueError, match="vybrat lot"):
            await close(env, "ASSIGNMENT", premium=None)

        assert env.db.tables.get("option_transactions", []) == []
        assert env.db.tables.get("transactions", []) == []


class TestClosingPremium:
    @pytest.mark.parametrize("position, action", [("short", "BTC"), ("long", "STC")])
    async def test_closing_by_trade_requires_a_premium(self, env, position, action):
        env.holding["position"] = position

        with pytest.raises(ValueError, match="prémi"):
            await close(env, action, premium=None)

        assert env.db.tables.get("option_transactions", []) == []

    async def test_zero_premium_is_a_valid_closing_price(self, env):
        await close(env, "BTC", premium=0)

        assert env.db.tables["option_transactions"][0]["premium"] == 0

    async def test_expiration_needs_no_premium(self, env):
        await close(env, "EXPIRATION", premium=None)

        assert len(env.db.tables["option_transactions"]) == 1


class TestCzkRateRequired:
    def opening(self, **overrides):
        return OptionTransactionCreate(
            symbol="AAPL", option_type="put", strike_price=150, expiration_date=date(2027, 1, 15),
            action="STO", contracts=1, premium=2, date=date(2026, 10, 1),
            **{"exchange_rate_to_czk": 22.0, **overrides},
        )

    async def test_opening_in_a_foreign_currency_without_a_rate_is_refused(self, env):
        with pytest.raises(ValueError, match="kurz"):
            await env.service.create_transaction("p1", self.opening(exchange_rate_to_czk=None))

        assert env.db.tables.get("option_transactions", []) == []

    async def test_opening_with_a_rate_is_stored(self, env):
        await env.service.create_transaction("p1", self.opening())

        assert len(env.db.tables["option_transactions"]) == 1

    async def test_opening_in_crowns_needs_no_rate(self, env):
        await env.service.create_transaction("p1", self.opening(currency="CZK", exchange_rate_to_czk=None))

        assert len(env.db.tables["option_transactions"]) == 1

    @pytest.mark.parametrize("action", ["BTC", "ASSIGNMENT"])
    async def test_closing_that_moves_money_without_a_rate_is_refused_before_anything_is_written(self, env, action):
        with pytest.raises(ValueError, match="kurz"):
            await env.service.close_position(
                portfolio_id="p1", option_symbol=OPTION_SYMBOL, closing_action=action, contracts=1,
                premium=1 if action == "BTC" else None, close_date=date(2025, 1, 10),
            )

        assert env.db.tables.get("option_transactions", []) == []
        assert env.db.tables.get("transactions", []) == []

    async def test_an_expiry_moves_no_money_and_needs_no_rate(self, env):
        await env.service.close_position(
            portfolio_id="p1", option_symbol=OPTION_SYMBOL, closing_action="EXPIRATION", contracts=1,
            premium=None, close_date=date(2025, 1, 17),
        )

        assert env.db.tables["option_transactions"][0]["action"] == "EXPIRATION"

    async def test_the_endpoint_turns_the_refusal_into_a_400_not_a_500(self, env, monkeypatch):
        from fastapi import HTTPException

        from app.api.endpoints import options as options_endpoint

        async def owned(*_args):
            return True

        monkeypatch.setattr(options_endpoint.portfolio_service, "verify_portfolio_ownership", owned)
        monkeypatch.setattr(options_endpoint, "options_service", env.service)

        with pytest.raises(HTTPException) as refused:
            await options_endpoint.create_option_transaction(
                portfolio_id="p1", data=self.opening(exchange_rate_to_czk=None), user_id="u1"
            )

        assert refused.value.status_code == 400 and "kurz" in refused.value.detail

