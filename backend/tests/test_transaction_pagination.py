"""Transaction history pagination must neither skip nor repeat rows that share a timestamp."""
import uuid

import pytest

from app.core.pagination import decode_cursor, encode_cursor, older_than_filter
from app.services import portfolio as portfolio_module
from app.services.portfolio import PortfolioService
from tests.fake_supabase import FakeSupabase

TS = "2026-03-12T00:00:00+00:00"
ROW_ID = "11111111-1111-1111-1111-111111111111"


class TestCursor:
    def test_round_trip(self):
        assert decode_cursor(encode_cursor(TS, ROW_ID)) == (TS, ROW_ID)

    def test_filter_selects_older_time_or_same_time_with_smaller_id(self):
        assert older_than_filter("executed_at", encode_cursor(TS, ROW_ID)) == (
            f'executed_at.lt."{TS}",and(executed_at.eq."{TS}",id.lt."{ROW_ID}")'
        )

    @pytest.mark.parametrize(
        "cursor",
        [
            TS,  # old style cursor without an id
            f"not-a-date|{ROW_ID}",
            f"{TS}|not-a-uuid",
            f'{TS}"),user_id.eq.x,or(a.eq."|{ROW_ID}',  # filter injection attempt
            "",
        ],
    )
    def test_cursor_we_did_not_issue_is_rejected(self, cursor):
        with pytest.raises(ValueError):
            decode_cursor(cursor)


@pytest.fixture
def service(monkeypatch):
    db = FakeSupabase()
    monkeypatch.setattr(portfolio_module, "supabase", db)
    db.tables["portfolios"] = [{"id": "p1", "name": "Main", "user_id": "u1"}]

    svc = PortfolioService()

    async def annotate(rows):
        return rows

    monkeypatch.setattr(svc, "_annotate_transactions", annotate)
    return svc, db


def seed(db, count, timestamp_for):
    db.tables["transactions"] = [
        {"id": str(uuid.UUID(int=i + 1)), "portfolio_id": "p1", "executed_at": timestamp_for(i)}
        for i in range(count)
    ]


async def read_all_pages(svc, limit):
    ids, cursor = [], None
    while True:
        page = await svc.get_all_transactions("u1", limit=limit, cursor=cursor)
        ids.extend(tx["id"] for tx in page["data"])
        if not page["has_more"]:
            return ids
        cursor = page["next_cursor"]


async def test_transactions_sharing_a_timestamp_are_all_returned_exactly_once(service):
    svc, db = service
    seed(db, 11, lambda i: TS)  # a whole day of trades, page boundary falls inside it

    ids = await read_all_pages(svc, limit=4)

    assert sorted(ids) == sorted(tx["id"] for tx in db.tables["transactions"])
    assert len(ids) == len(set(ids))


async def test_mixed_timestamps_come_back_newest_first_without_gaps(service):
    svc, db = service
    seed(db, 13, lambda i: f"2026-03-{12 - i // 3:02d}T00:00:00+00:00")  # groups of three per day

    ids = await read_all_pages(svc, limit=2)

    assert len(ids) == 13 and len(set(ids)) == 13
    stored = {tx["id"]: tx["executed_at"] for tx in db.tables["transactions"]}
    times = [stored[i] for i in ids]
    assert times == sorted(times, reverse=True)


async def test_malformed_cursor_is_reported_as_a_value_error(service):
    svc, _ = service

    with pytest.raises(ValueError):
        await svc.get_all_transactions("u1", limit=5, cursor=TS)
