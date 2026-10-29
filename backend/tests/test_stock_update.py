"""A stock update touches only the fields the request carries; an explicit null clears the optional ones."""
import pytest

from app.schemas.stocks import StockUpdate
from app.services import stocks as stocks_module
from app.services.stocks import StockService
from tests.fake_supabase import FakeSupabase


@pytest.fixture
def stock(monkeypatch):
    db = FakeSupabase()
    db.tables["stocks"] = [
        {
            "id": "s1", "ticker": "AAPL", "name": "Apple Inc.", "currency": "USD", "price_scale": 1.0,
            "sector": "Technology", "industry": "Consumer Electronics", "exchange": "NASDAQ",
            "country": "US", "notes": "core holding",
        }
    ]
    monkeypatch.setattr(stocks_module, "supabase", db)
    return db.tables["stocks"][0]


def update(payload: dict):
    return StockService().update("s1", StockUpdate(**payload))


@pytest.mark.parametrize("field", ["sector", "industry", "exchange", "country", "notes"])
async def test_explicit_null_clears_an_optional_field_only(stock, field):
    before = dict(stock)

    await update({field: None})

    assert stock[field] is None
    assert {k: v for k, v in stock.items() if k != field} == {k: v for k, v in before.items() if k != field}


async def test_omitted_fields_stay_as_they_were(stock):
    before = dict(stock)

    await update({"name": "Apple"})

    assert stock == {**before, "name": "Apple"}


@pytest.mark.parametrize("field", ["name", "currency", "price_scale"])
async def test_null_does_not_clear_a_required_field(stock, field):
    before = dict(stock)

    await update({field: None})

    assert stock == before


async def test_empty_update_changes_nothing(stock):
    before = dict(stock)

    result = await update({})

    assert stock == before
    assert result["id"] == "s1"


async def test_unknown_stock_returns_none(stock):
    assert await StockService().update("missing", StockUpdate(notes="x")) is None
