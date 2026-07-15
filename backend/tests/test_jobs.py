import pytest

from app.jobs import runner, scheduled


@pytest.mark.asyncio
async def test_run_price_target_alerts_calls_service_with_redis(monkeypatch):
    redis = object()
    calls = []

    monkeypatch.setattr(scheduled, "get_redis", lambda: redis)

    async def check_all_users(received_redis):
        calls.append(received_redis)
        return {"users_checked": 2, "alerts_sent": 1}

    monkeypatch.setattr(scheduled.price_alert_service, "check_all_users", check_all_users)

    result = await scheduled.run_price_target_alerts()

    assert calls == [redis]
    assert result == {"success": True, "users_checked": 2, "alerts_sent": 1}


@pytest.mark.asyncio
async def test_run_custom_price_alerts_calls_service_with_redis(monkeypatch):
    redis = object()
    calls = []

    monkeypatch.setattr(scheduled, "get_redis", lambda: redis)

    async def check_custom_alerts(received_redis):
        calls.append(received_redis)
        return {"alerts_checked": 3, "alerts_triggered": 1}

    monkeypatch.setattr(scheduled.price_alert_service, "check_custom_alerts", check_custom_alerts)

    result = await scheduled.run_custom_price_alerts()

    assert calls == [redis]
    assert result == {"success": True, "alerts_checked": 3, "alerts_triggered": 1}


@pytest.mark.asyncio
async def test_run_earnings_alerts_refreshes_calendar_before_sending_alerts(monkeypatch):
    redis = object()
    calls = []

    monkeypatch.setattr(scheduled, "get_redis", lambda: redis)

    async def refresh_due_watchlist_tickers():
        calls.append("refresh")
        return {
            "tickers_due": 4,
            "tickers_refreshed": 3,
            "orphaned_entries_deleted": 1,
        }

    async def check_all_users(received_redis):
        calls.append(("alerts", received_redis))
        return {"users_checked": 2, "alerts_sent": 1}

    monkeypatch.setattr(
        scheduled.earnings_calendar_service,
        "refresh_due_watchlist_tickers",
        refresh_due_watchlist_tickers,
    )
    monkeypatch.setattr(scheduled.earnings_alert_service, "check_all_users", check_all_users)

    result = await scheduled.run_earnings_alerts()

    assert calls == ["refresh", ("alerts", redis)]
    assert result == {
        "success": True,
        "tickers_due": 4,
        "tickers_refreshed": 3,
        "orphaned_entries_deleted": 1,
        "users_checked": 2,
        "alerts_sent": 1,
    }


@pytest.mark.asyncio
async def test_run_refresh_earnings_calendar_force_cleans_then_refreshes_all_watchlist_tickers(monkeypatch):
    calls = []

    async def cleanup_orphaned_entries():
        calls.append("cleanup")
        return {"orphaned_entries_found": 2, "orphaned_entries_deleted": 2}

    async def get_watchlist_tickers():
        calls.append("tickers")
        return ["AAPL", "MSFT"]

    async def refresh_tickers(tickers):
        calls.append(("refresh", tickers))
        return {"tickers_requested": 2, "tickers_refreshed": 2}

    monkeypatch.setattr(
        scheduled.earnings_calendar_service,
        "cleanup_orphaned_entries",
        cleanup_orphaned_entries,
    )
    monkeypatch.setattr(
        scheduled.earnings_calendar_service,
        "get_watchlist_tickers",
        get_watchlist_tickers,
    )
    monkeypatch.setattr(scheduled.earnings_calendar_service, "refresh_tickers", refresh_tickers)

    result = await scheduled.run_refresh_earnings_calendar_force()

    assert calls == ["cleanup", "tickers", ("refresh", ["AAPL", "MSFT"])]
    assert result == {
        "success": True,
        "tickers_requested": 2,
        "tickers_refreshed": 2,
        "orphaned_entries_found": 2,
        "orphaned_entries_deleted": 2,
    }


@pytest.mark.asyncio
async def test_runner_rejects_unknown_job_and_closes_redis_pool(monkeypatch):
    closed = []

    async def close_redis_pool():
        closed.append(True)

    monkeypatch.setattr(runner, "close_redis_pool", close_redis_pool)

    with pytest.raises(ValueError, match="Unknown job"):
        await runner.run_job("not-a-job")

    assert closed == []


@pytest.mark.asyncio
async def test_runner_closes_redis_pool_after_success(monkeypatch):
    closed = []

    async def handler():
        return {"success": True}

    async def close_redis_pool():
        closed.append(True)

    monkeypatch.setitem(runner.JOB_HANDLERS, "test-job", handler)
    monkeypatch.setattr(runner, "close_redis_pool", close_redis_pool)

    result = await runner.run_job("test-job")

    assert result == {"success": True}
    assert closed == [True]


@pytest.mark.asyncio
async def test_runner_closes_redis_pool_after_failure(monkeypatch):
    closed = []

    async def handler():
        raise RuntimeError("boom")

    async def close_redis_pool():
        closed.append(True)

    monkeypatch.setitem(runner.JOB_HANDLERS, "failing-job", handler)
    monkeypatch.setattr(runner, "close_redis_pool", close_redis_pool)

    with pytest.raises(RuntimeError, match="boom"):
        await runner.run_job("failing-job")

    assert closed == [True]
