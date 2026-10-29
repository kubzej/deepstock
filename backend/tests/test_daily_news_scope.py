"""Replacing the briefing scope never leaves the user with an empty scope after a failed write."""
import pytest

from app.services import daily_news_settings as module
from app.services.daily_news_settings import DailyNewsSettingsService
from tests.fake_supabase import FakeSupabase

TABLE = "daily_news_briefing_scope_items"


def scope_row(row_id: str, source_type: str, source_id: str, priority: str = "medium") -> dict:
    return {"id": row_id, "user_id": "u1", "source_type": source_type, "source_id": source_id,
            "enabled": True, "priority": priority, "created_at": "2026-01-01T00:00:00+00:00"}


def item(source_type: str, source_id: str, priority: str = "medium") -> dict:
    return {"source_type": source_type, "source_id": source_id, "enabled": True, "priority": priority}


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    fake.tables[TABLE] = [scope_row("r1", "portfolio", "p1"), scope_row("r2", "watchlist", "w1")]
    monkeypatch.setattr(module, "supabase", fake)

    async def owned(*_args):
        return True

    monkeypatch.setattr(module.portfolio_service, "verify_portfolio_ownership", owned)
    monkeypatch.setattr(module.watchlist_service, "verify_watchlist_ownership", owned)
    return fake


def stored(db):
    return sorted((r["source_type"], r["source_id"], r["priority"]) for r in db.tables[TABLE])


async def replace(items):
    return await DailyNewsSettingsService().replace_scope_items("u1", items)


async def test_new_selection_replaces_the_old_one(db):
    result = await replace([item("portfolio", "p1", "high"), item("watchlist", "w2")])

    assert stored(db) == [("portfolio", "p1", "high"), ("watchlist", "w2", "medium")]
    assert sorted(r["source_id"] for r in result) == ["p1", "w2"]


async def test_kept_source_keeps_its_row(db):
    await replace([item("portfolio", "p1", "high")])

    kept = next(r for r in db.tables[TABLE] if r["source_id"] == "p1")
    assert kept["id"] == "r1" and kept["created_at"] == "2026-01-01T00:00:00+00:00"


async def test_empty_selection_clears_the_scope(db):
    await replace([])

    assert db.tables[TABLE] == []


async def test_failed_write_leaves_the_old_scope_untouched(db):
    db.failures[(TABLE, "upsert")] = RuntimeError("supabase down")

    with pytest.raises(RuntimeError):
        await replace([item("watchlist", "w2")])

    assert stored(db) == [("portfolio", "p1", "medium"), ("watchlist", "w1", "medium")]


async def test_failed_cleanup_keeps_the_new_selection(db):
    db.failures[(TABLE, "delete")] = RuntimeError("supabase down")

    with pytest.raises(RuntimeError):
        await replace([item("watchlist", "w2")])

    assert ("watchlist", "w2", "medium") in stored(db)


async def test_same_source_twice_is_written_once_with_the_last_priority(db):
    await replace([item("portfolio", "p1", "low"), item("portfolio", "p1", "high")])

    assert stored(db) == [("portfolio", "p1", "high")]


async def test_unowned_source_writes_nothing(db, monkeypatch):
    async def not_owned(*_args):
        return False

    monkeypatch.setattr(module.watchlist_service, "verify_watchlist_ownership", not_owned)

    with pytest.raises(ValueError):
        await replace([item("portfolio", "p1", "high"), item("watchlist", "w2")])

    assert stored(db) == [("portfolio", "p1", "medium"), ("watchlist", "w1", "medium")]


async def test_unknown_source_type_is_rejected(db):
    with pytest.raises(ValueError):
        await replace([item("sector", "x")])

    assert len(db.tables[TABLE]) == 2
