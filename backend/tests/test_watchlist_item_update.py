"""A watchlist item update touches only the fields the request carries; an explicit null clears one."""
import pytest

from app.services import watchlist as watchlist_module
from app.services.watchlist import WatchlistService
from tests.fake_supabase import FakeSupabase
from app.schemas.watchlist import WatchlistItemUpdate


@pytest.fixture
def item(monkeypatch):
    db = FakeSupabase()
    db.tables["watchlist_items"] = [
        {"id": "i1", "target_buy_price": 90.0, "target_sell_price": 150.0, "notes": "wait for earnings"}
    ]
    monkeypatch.setattr(watchlist_module, "supabase", db)
    return db.tables["watchlist_items"][0]


def update(**fields):
    return WatchlistService().update_item("i1", WatchlistItemUpdate(**fields))


async def test_updating_one_field_keeps_the_others(item):
    result = await update(notes="buy the dip")

    assert (item["notes"], item["target_buy_price"], item["target_sell_price"]) == ("buy the dip", 90.0, 150.0)
    assert result["notes"] == "buy the dip"


async def test_explicit_null_clears_that_field_only(item):
    await update(target_buy_price=None)

    assert item["target_buy_price"] is None
    assert (item["target_sell_price"], item["notes"]) == (150.0, "wait for earnings")


async def test_empty_update_changes_nothing(item):
    before = dict(item)

    result = await update()

    assert item == before
    assert result["id"] == "i1"


async def test_unknown_item_returns_none(item):
    assert await WatchlistService().update_item("missing", WatchlistItemUpdate(notes="x")) is None
