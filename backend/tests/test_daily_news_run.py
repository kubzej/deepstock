"""A finished briefing for today is never regenerated, re-sent or overwritten."""
from datetime import datetime, timedelta, timezone

import pytest

from app.services import daily_news as module
from app.services.daily_news import DailyNewsService
from tests.fake_supabase import FakeSupabase


def report(status: str, hours_ago: float = 0.0, **extra) -> dict:
    moment = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()
    return {"user_id": "u1", "status": status, "window_end": moment, "created_at": moment, **extra}


@pytest.fixture
def setup(monkeypatch):
    db = FakeSupabase()
    db.tables["daily_news_briefing_settings"] = [{"user_id": "u1", "enabled": True}]
    db.tables["daily_news_reports"] = []
    monkeypatch.setattr(module, "supabase", db)
    runs: list[str] = []

    async def run_for_user(self, user_id):
        runs.append(user_id)
        row = report("succeeded", notification_status="sent:1")
        db.tables["daily_news_reports"].append(row)
        return row

    monkeypatch.setattr(DailyNewsService, "run_for_user", run_for_user)
    monkeypatch.setattr(DailyNewsService, "cleanup_stale_running_reports", lambda self, user_id=None: _zero())
    return db, runs


async def _zero():
    return 0


async def test_today_with_a_finished_report_is_skipped_and_reported_as_such(setup):
    db, runs = setup
    finished = report("succeeded", notification_status="sent:1")
    db.tables["daily_news_reports"].append(finished)

    result = await DailyNewsService().run_enabled_users()

    assert runs == []
    assert db.tables["daily_news_reports"] == [finished]
    assert (result["already_generated"], result["reports_generated"], result["notifications_sent"]) == (1, 0, 0)


async def test_degraded_report_also_counts_as_done(setup):
    db, runs = setup
    db.tables["daily_news_reports"].append(report("degraded"))

    await DailyNewsService().run_enabled_users()

    assert runs == []


@pytest.mark.parametrize("status", ["failed", "running"])
async def test_failed_or_unfinished_report_does_not_block_a_new_run(setup, status):
    db, runs = setup
    db.tables["daily_news_reports"].append(report(status))

    result = await DailyNewsService().run_enabled_users()

    assert runs == ["u1"]
    assert (result["already_generated"], result["reports_generated"], result["notifications_sent"]) == (0, 1, 1)


async def test_yesterdays_report_does_not_block_todays_run(setup):
    db, runs = setup
    db.tables["daily_news_reports"].append(report("succeeded", hours_ago=30))

    await DailyNewsService().run_enabled_users()

    assert runs == ["u1"]


async def test_creating_a_report_never_reuses_an_existing_one(monkeypatch):
    db = FakeSupabase()
    db.tables["daily_news_reports"] = [report("succeeded", id="old")]
    monkeypatch.setattr(module, "supabase", db)
    now = datetime.now(timezone.utc)

    created = await DailyNewsService()._create_report(user_id="u1", window_start=now - timedelta(hours=24), window_end=now)

    assert created["status"] == "running" and created["id"] != "old"
