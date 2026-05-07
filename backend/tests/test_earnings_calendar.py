from datetime import datetime, timedelta, timezone

import pytest

from app.services.earnings_calendar import EarningsCalendarService


class _SupabaseQueryStub:
    def __init__(self, data):
        self._data = data

    def select(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def execute(self):
        return type("Response", (), {"data": self._data})()


class _CleanupQueryStub:
    def __init__(self, state, table_name):
        self._state = state
        self._table_name = table_name
        self._delete_mode = False
        self._selected_stock_ids = None

    def select(self, *_args, **_kwargs):
        return self

    def delete(self):
        self._delete_mode = True
        return self

    def in_(self, column, values):
        if self._delete_mode:
            assert self._table_name == "earnings_calendar"
            assert column == "stock_id"
            self._selected_stock_ids = set(values)
        return self

    def execute(self):
        if self._table_name == "watchlist_items":
            return type("Response", (), {"data": self._state["watchlist_items"]})()

        if self._table_name == "earnings_calendar":
            if self._delete_mode:
                self._state["earnings_calendar"] = [
                    row
                    for row in self._state["earnings_calendar"]
                    if row["stock_id"] not in self._selected_stock_ids
                ]
            return type("Response", (), {"data": self._state["earnings_calendar"]})()

        raise AssertionError(f"Unexpected table {self._table_name}")


@pytest.mark.asyncio
async def test_get_due_tickers_treats_null_earnings_date_as_due(monkeypatch):
    service = EarningsCalendarService()
    last_checked = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()

    async def _watchlist_tickers():
        return ["AMZN", "MSFT", "NVDA"]

    monkeypatch.setattr(service, "get_watchlist_tickers", _watchlist_tickers)
    monkeypatch.setattr(
        "app.services.earnings_calendar.supabase",
        type(
            "SupabaseStub",
            (),
            {
                "table": staticmethod(
                    lambda _name: _SupabaseQueryStub(
                        [
                            {
                                "ticker": "AMZN",
                                "earnings_calendar": {
                                    "earnings_date": None,
                                    "last_checked_at": last_checked,
                                },
                            },
                            {
                                "ticker": "MSFT",
                                "earnings_calendar": {
                                    "earnings_date": "2026-05-14",
                                    "last_checked_at": last_checked,
                                },
                            },
                            {
                                "ticker": "NVDA",
                                "earnings_calendar": None,
                            },
                        ]
                    )
                )
            },
        )(),
    )

    due = await service.get_due_tickers()

    assert due == ["AMZN", "NVDA"]


@pytest.mark.asyncio
async def test_cleanup_orphaned_entries_deletes_only_non_watchlist_stock_ids(monkeypatch):
    service = EarningsCalendarService()
    state = {
        "watchlist_items": [
            {"stock_id": "stock-1"},
            {"stock_id": "stock-2"},
            {"stock_id": "stock-2"},
        ],
        "earnings_calendar": [
            {"stock_id": "stock-1"},
            {"stock_id": "stock-3"},
            {"stock_id": "stock-4"},
        ],
    }

    monkeypatch.setattr(
        "app.services.earnings_calendar.supabase",
        type(
            "SupabaseStub",
            (),
            {
                "table": staticmethod(
                    lambda table_name: _CleanupQueryStub(state, table_name)
                )
            },
        )(),
    )

    result = await service.cleanup_orphaned_entries()

    assert result == {
        "orphaned_entries_found": 2,
        "orphaned_entries_deleted": 2,
    }
    assert state["earnings_calendar"] == [{"stock_id": "stock-1"}]
