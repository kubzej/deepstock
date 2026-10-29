"""Transaction writes must be all-or-nothing together with the holding recalculation."""
from datetime import datetime, timezone

import pytest

from app.services import portfolio as portfolio_module
from app.services.portfolio import PortfolioService
from tests.fake_supabase import FakeSupabase
from app.schemas.portfolio import TransactionCreate, TransactionUpdate


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(portfolio_module, "supabase", fake)

    async def get_or_create(*_args, **_kwargs):
        return {"id": "stock-1", "ticker": "AAPL"}

    monkeypatch.setattr(portfolio_module.stock_service, "get_or_create", get_or_create)
    return fake


@pytest.fixture
def service(monkeypatch):
    svc = PortfolioService()

    async def annotate(transactions):
        return transactions

    monkeypatch.setattr(svc, "_annotate_transactions", annotate)
    return svc


def buy(**overrides) -> TransactionCreate:
    return TransactionCreate(
        stock_ticker="AAPL",
        type="BUY",
        shares=10,
        price_per_share=100,
        executed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        **{"exchange_rate_to_czk": 22.0, **overrides},
    )


def failing_recalc(calls: list):
    async def recalc(portfolio_id, stock_id):
        calls.append((portfolio_id, stock_id))
        raise RuntimeError("supabase unavailable")

    return recalc


class TestAddTransaction:
    async def test_stores_transaction_and_recalculates(self, db, service, monkeypatch):
        calls = []

        async def recalc(portfolio_id, stock_id):
            calls.append((portfolio_id, stock_id))

        monkeypatch.setattr(service, "_recalculate_holding", recalc)

        result = await service.add_transaction("p1", buy())

        assert result["shares"] == 10
        assert len(db.tables["transactions"]) == 1
        assert calls == [("p1", "stock-1")]

    async def test_failed_recalculation_leaves_no_transaction_behind(self, db, service, monkeypatch):
        calls = []
        monkeypatch.setattr(service, "_recalculate_holding", failing_recalc(calls))

        with pytest.raises(RuntimeError):
            await service.add_transaction("p1", buy())

        assert db.tables["transactions"] == []

    async def test_failure_while_annotating_does_not_fail_a_committed_write(self, db, service, monkeypatch):
        async def recalc(portfolio_id, stock_id):
            return None

        async def broken_annotate(_transactions):
            raise RuntimeError("market data down")

        monkeypatch.setattr(service, "_recalculate_holding", recalc)
        monkeypatch.setattr(service, "_annotate_transactions", broken_annotate)

        result = await service.add_transaction("p1", buy())

        assert result["id"] == db.tables["transactions"][0]["id"]


class TestAddSell:
    def sell(self, **overrides) -> TransactionCreate:
        return TransactionCreate(
            stock_ticker="AAPL",
            type="SELL",
            shares=5,
            price_per_share=120,
            executed_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
            **{"exchange_rate_to_czk": 22.0, **overrides},
        )

    async def test_sell_without_lot_is_rejected_before_anything_is_stored(self, db, service, monkeypatch):
        async def recalc(portfolio_id, stock_id):
            raise AssertionError("must not recalculate")

        monkeypatch.setattr(service, "_recalculate_holding", recalc)

        with pytest.raises(ValueError, match="lot"):
            await service.add_transaction("p1", self.sell())

        assert db.tables.get("transactions", []) == []


class TestUpdateTransaction:
    def _seed(self, db):
        db.tables["transactions"] = [
            {
                "id": "tx-1",
                "portfolio_id": "p1",
                "stock_id": "stock-1",
                "type": "BUY",
                "shares": 10,
                "price_per_share": 100,
                "total_amount": 1000,
                "currency": "USD",
                "exchange_rate_to_czk": 22.0,
                "fees": 1,
                "notes": "original",
                "executed_at": "2026-01-01T00:00:00+00:00",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
            }
        ]

    async def test_failed_recalculation_restores_previous_values(self, db, service, monkeypatch):
        self._seed(db)
        monkeypatch.setattr(service, "_recalculate_holding", failing_recalc([]))
        monkeypatch.setattr(service, "_get_sold_amount_for_buy_lot", lambda _tx: _zero())

        with pytest.raises(RuntimeError):
            await service.update_transaction("p1", "tx-1", TransactionUpdate(notes="changed", fees=5))

        row = db.tables["transactions"][0]
        assert row["notes"] == "original"
        assert row["fees"] == 1
        assert row["updated_at"] == "2026-01-01T00:00:00+00:00"

    async def test_unknown_transaction_returns_none(self, db, service):
        assert await service.update_transaction("p1", "missing", TransactionUpdate(notes="x")) is None


async def _zero():
    return 0.0


class TestDeleteTransaction:
    def _seed(self, db):
        db.tables["transactions"] = [
            {"id": "tx-1", "portfolio_id": "p1", "stock_id": "stock-1", "type": "SELL", "shares": 1}
        ]

    async def test_transient_recalculation_failure_is_retried_once(self, db, service, monkeypatch):
        self._seed(db)
        attempts = []

        async def flaky(portfolio_id, stock_id):
            attempts.append(1)
            if len(attempts) == 1:
                raise RuntimeError("transient")

        monkeypatch.setattr(service, "_recalculate_holding", flaky)

        assert await service.delete_transaction("p1", "tx-1") is True
        assert len(attempts) == 2
        assert db.tables["transactions"] == []

    async def test_persistent_recalculation_failure_is_reported(self, db, service, monkeypatch):
        self._seed(db)
        calls = []
        monkeypatch.setattr(service, "_recalculate_holding", failing_recalc(calls))

        with pytest.raises(RuntimeError):
            await service.delete_transaction("p1", "tx-1")

        assert len(calls) == 2

    async def test_unknown_transaction_returns_false(self, db, service):
        assert await service.delete_transaction("p1", "missing") is False


class TestCzkRateRequired:
    async def test_foreign_currency_without_a_rate_is_refused_and_nothing_is_stored(self, db, service, monkeypatch):
        async def recalc(portfolio_id, stock_id):
            raise AssertionError("must not recalculate")

        monkeypatch.setattr(service, "_recalculate_holding", recalc)

        with pytest.raises(ValueError, match="kurz"):
            await service.add_transaction("p1", buy(exchange_rate_to_czk=None))

        assert db.tables.get("transactions", []) == []

    async def test_czech_crowns_need_no_rate(self, db, service, monkeypatch):
        async def recalc(portfolio_id, stock_id):
            return None

        monkeypatch.setattr(service, "_recalculate_holding", recalc)

        await service.add_transaction("p1", buy(currency="CZK", exchange_rate_to_czk=None))

        assert len(db.tables["transactions"]) == 1

    def _legacy_row(self, db, **overrides):
        db.tables["transactions"] = [{
            "id": "tx-1", "portfolio_id": "p1", "stock_id": "stock-1", "type": "BUY", "shares": 10,
            "price_per_share": 100, "total_amount": 1000, "currency": "USD", "exchange_rate_to_czk": None,
            "fees": 0, "notes": "old", "executed_at": "2026-01-01T00:00:00+00:00",
            "created_at": "2026-01-01T00:00:00+00:00", **overrides,
        }]

    async def test_editing_a_row_that_has_no_rate_asks_for_it(self, db, service, monkeypatch):
        self._legacy_row(db)
        monkeypatch.setattr(service, "_recalculate_holding", lambda *_a: _zero())
        monkeypatch.setattr(service, "_get_sold_amount_for_buy_lot", lambda _tx: _zero())

        with pytest.raises(ValueError, match="kurz"):
            await service.update_transaction("p1", "tx-1", TransactionUpdate(notes="changed"))

        assert db.tables["transactions"][0]["notes"] == "old"

    async def test_supplying_the_rate_repairs_the_row(self, db, service, monkeypatch):
        self._legacy_row(db)
        monkeypatch.setattr(service, "_recalculate_holding", lambda *_a: _zero())
        monkeypatch.setattr(service, "_get_sold_amount_for_buy_lot", lambda _tx: _zero())

        await service.update_transaction("p1", "tx-1", TransactionUpdate(exchange_rate_to_czk=22.4))

        assert db.tables["transactions"][0]["exchange_rate_to_czk"] == 22.4

    async def test_update_writes_no_column_the_transactions_table_lacks(self, db, service, monkeypatch):
        # transactions has created_at only; writing updated_at made Supabase reject every edit
        self._legacy_row(db)
        monkeypatch.setattr(service, "_recalculate_holding", lambda *_a: _zero())
        monkeypatch.setattr(service, "_get_sold_amount_for_buy_lot", lambda _tx: _zero())

        await service.update_transaction("p1", "tx-1", TransactionUpdate(exchange_rate_to_czk=22.4, notes="changed"))

        assert "updated_at" not in db.tables["transactions"][0]

    async def test_editing_a_czech_row_without_a_rate_is_fine(self, db, service, monkeypatch):
        self._legacy_row(db, currency="CZK")
        monkeypatch.setattr(service, "_recalculate_holding", lambda *_a: _zero())
        monkeypatch.setattr(service, "_get_sold_amount_for_buy_lot", lambda _tx: _zero())

        await service.update_transaction("p1", "tx-1", TransactionUpdate(notes="changed"))

        assert db.tables["transactions"][0]["notes"] == "changed"

