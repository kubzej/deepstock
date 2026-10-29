"""The mixed stock/option activity feed must page through every row exactly once."""
import uuid

import pytest

from app.services import options as options_module
from app.services import portfolio as portfolio_module
from app.services import research_context_activity as activity_module
from app.services.research_context_activity import (
    ActivityFilterError,
    _option_older_than_filter,
    activity_portfolio_context_service,
)
from app.core.pagination import encode_cursor
from tests.fake_supabase import FakeSupabase

MIDNIGHT = "2026-03-12T00:00:00+00:00"
ROW_ID = "11111111-1111-1111-1111-111111111111"


def uid(number: int) -> str:
    return str(uuid.UUID(int=number))


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    for module in (activity_module, portfolio_module, options_module):
        monkeypatch.setattr(module, "supabase", fake)
    fake.tables["portfolios"] = [{"id": "p1", "name": "Main", "user_id": "u1"}]
    fake.tables["transactions"] = []
    fake.tables["option_transactions"] = []

    async def identity(rows):
        return rows

    monkeypatch.setattr(activity_module.portfolio_service, "_annotate_transactions", identity)
    monkeypatch.setattr(activity_module.options_service, "_annotate_transactions", identity)
    return fake


def add_stock(db, number, executed_at):
    db.tables["transactions"].append(
        {"id": uid(number), "portfolio_id": "p1", "executed_at": executed_at, "type": "BUY", "shares": 1}
    )


def add_option(db, number, day):
    db.tables["option_transactions"].append(
        {
            "id": uid(number),
            "portfolio_id": "p1",
            "date": day,
            "symbol": "AAPL",
            "action": "STO",
            "portfolios": {"name": "Main"},  # embedded join the real query selects
        }
    )


async def read_all_pages(limit):
    seen, cursor = [], None
    while True:
        page = await activity_portfolio_context_service.get_portfolio_activity(
            user_id="u1", limit=limit, cursor=cursor
        )
        seen.extend((tx["asset_type"], tx["id"], tx["executed_at"]) for tx in page["transactions"])
        if not page["has_more"]:
            return seen
        cursor = page["next_cursor"]


async def test_stock_and_option_rows_sharing_a_day_are_all_returned_once(db):
    for number in (1, 3, 5, 7, 9):
        add_stock(db, number, MIDNIGHT)
    for number in (2, 4, 6, 8, 10, 11):
        add_option(db, number, "2026-03-12")

    seen = await read_all_pages(limit=3)

    ids = [row[1] for row in seen]
    assert sorted(ids) == sorted(uid(n) for n in range(1, 12))
    assert len(ids) == len(set(ids))
    assert ids == sorted(ids, reverse=True)  # same moment, so id decides


async def test_rows_across_days_come_back_newest_first_without_gaps(db):
    number = 1
    for day in ("2026-03-12", "2026-03-11", "2026-03-10"):
        for _ in range(2):
            add_stock(db, number, f"{day}T00:00:00+00:00")
            number += 1
            add_option(db, number, day)
            number += 1

    seen = await read_all_pages(limit=5)

    assert len(seen) == 12 and len({row[1] for row in seen}) == 12
    days = [row[2][:10] for row in seen]
    assert days == sorted(days, reverse=True)


async def test_page_boundary_on_a_stock_later_in_the_day_keeps_that_days_options(db):
    add_stock(db, 1, "2026-03-12T14:30:00+00:00")
    add_stock(db, 2, MIDNIGHT)
    add_option(db, 3, "2026-03-12")
    add_option(db, 4, "2026-03-12")

    seen = await read_all_pages(limit=1)

    assert sorted(row[1] for row in seen) == sorted(uid(n) for n in range(1, 5))
    assert len(seen) == 4


async def test_cursor_that_was_not_issued_by_the_feed_is_rejected(db):
    with pytest.raises(ActivityFilterError):
        await activity_portfolio_context_service.get_portfolio_activity(
            user_id="u1", cursor="2026-03-12T00:00:00+00:00"
        )


class TestOptionCursorFilter:
    def test_cursor_at_midnight_compares_day_and_id(self):
        assert _option_older_than_filter(encode_cursor(MIDNIGHT, ROW_ID)) == (
            f'date.lt."2026-03-12",and(date.eq."2026-03-12",id.lt."{ROW_ID}")'
        )

    def test_cursor_later_in_the_day_includes_the_whole_day(self):
        assert _option_older_than_filter(encode_cursor("2026-03-12T14:30:00+00:00", ROW_ID)) == (
            'date.lte."2026-03-12"'
        )
