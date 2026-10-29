"""Option transactions are served newest first in stable pages, so a client can walk the whole history."""
import uuid

import pytest

from app.services import options as options_module
from app.services.options import OptionsService
from tests.fake_supabase import FakeSupabase


def tx(day, ordinal, portfolio="p1", symbol="AAPL", option_symbol="AAPL261218C00200000"):
    # ids sort the same way as `ordinal`, so (date, id) order is easy to read in the tests
    return {
        "id": str(uuid.UUID(int=ordinal)), "portfolio_id": portfolio, "symbol": symbol, "option_symbol": option_symbol,
        "date": day, "portfolios": {"name": f"Portfolio {portfolio}"},
    }


@pytest.fixture
def service(monkeypatch):
    db = FakeSupabase()
    db.tables["portfolios"] = [{"id": "p1", "user_id": "u1"}, {"id": "p2", "user_id": "u1"}, {"id": "px", "user_id": "other"}]
    db.tables["option_transactions"] = [
        tx("2026-10-01", 1), tx("2026-10-01", 2), tx("2026-10-01", 3),
        tx("2026-09-30", 4), tx("2026-09-29", 5, portfolio="p2"), tx("2026-09-28", 6, symbol="MSFT", option_symbol="MSFT261218P00400000"),
        tx("2026-09-27", 7, portfolio="px"),  # someone else's
    ]
    monkeypatch.setattr(options_module, "supabase", db)
    svc = OptionsService()
    svc.annotated: list = []

    async def annotate(rows):
        svc.annotated.append([r["id"] for r in rows])
        return [{**r, "realized_pl_czk": 1.0} for r in rows]

    monkeypatch.setattr(svc, "_annotate_transactions", annotate)
    return svc


def ordinals(page):
    return [uuid.UUID(row["id"]).int for row in page["data"]]


async def walk(service, limit, **filters):
    pages, cursor = [], None
    for _ in range(20):  # a broken cursor must fail the test, not hang it
        page = await service.get_transactions_page("u1", limit=limit, cursor=cursor, **filters)
        pages.append(page)
        cursor = page["next_cursor"]
        if not cursor:
            return pages
    raise AssertionError("the cursor never reached the last page")


async def test_first_page_is_newest_first_with_a_cursor_to_the_rest(service):
    page = await service.get_transactions_page("u1", limit=2)

    assert ordinals(page) == [3, 2]  # same date: the higher id first
    assert page["has_more"] is True and page["next_cursor"]


async def test_walking_the_cursor_returns_every_row_exactly_once(service):
    pages = await walk(service, limit=2)

    assert [ordinals(p) for p in pages] == [[3, 2], [1, 4], [5, 6]]
    assert [p["has_more"] for p in pages] == [True, True, False]
    assert pages[-1]["next_cursor"] is None


async def test_a_page_boundary_inside_one_date_loses_nothing(service):
    pages = await walk(service, limit=1)

    assert [ordinals(p)[0] for p in pages] == [3, 2, 1, 4, 5, 6]


async def test_other_users_rows_never_appear(service):
    pages = await walk(service, limit=100)

    assert 7 not in [n for p in pages for n in ordinals(p)]


async def test_filters_apply_before_paging(service):
    pages = await walk(service, limit=2, symbol="aapl", portfolio_id="p1")

    assert [n for p in pages for n in ordinals(p)] == [3, 2, 1, 4]


async def test_option_symbol_filter(service):
    page = await service.get_transactions_page("u1", option_symbol="MSFT261218P00400000")

    assert ordinals(page) == [6] and page["has_more"] is False


async def test_a_portfolio_of_someone_else_is_an_empty_page(service):
    page = await service.get_transactions_page("u1", portfolio_id="px")

    assert page == {"data": [], "next_cursor": None, "has_more": False}


async def test_a_user_without_portfolios_gets_an_empty_page(service):
    page = await service.get_transactions_page("nobody")

    assert page == {"data": [], "next_cursor": None, "has_more": False}


async def test_rows_carry_the_portfolio_name_and_the_annotation_of_the_accounting(service):
    page = await service.get_transactions_page("u1", limit=1)

    row = page["data"][0]
    assert row["portfolio_name"] == "Portfolio p1" and "portfolios" not in row
    assert row["realized_pl_czk"] == 1.0
    assert service.annotated == [[row["id"]]]  # only the rows of this page are annotated


async def test_a_cursor_we_did_not_issue_is_rejected(service):
    with pytest.raises(ValueError):
        await service.get_transactions_page("u1", cursor="not-a-cursor")


async def test_bounded_list_for_mcp_is_the_first_page_without_paging_metadata(service):
    rows = await service.get_transactions("u1", limit=2)

    assert [uuid.UUID(r["id"]).int for r in rows] == [3, 2]


async def test_endpoint_returns_a_page_and_rejects_a_foreign_cursor(service, monkeypatch):
    from fastapi import HTTPException

    from app.api.endpoints import options as options_endpoint

    monkeypatch.setattr(options_endpoint, "options_service", service)
    page = await options_endpoint.get_option_transactions(
        portfolio_id=None, symbol=None, option_symbol=None, limit=2, cursor=None, user_id="u1"
    )
    assert ordinals(page) == [3, 2] and page["has_more"] is True

    with pytest.raises(HTTPException) as bad:
        await options_endpoint.get_option_transactions(
            portfolio_id=None, symbol=None, option_symbol=None, limit=2, cursor="not-a-cursor", user_id="u1"
        )
    assert bad.value.status_code == 400
