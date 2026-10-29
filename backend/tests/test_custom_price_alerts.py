"""A custom price alert is recorded as triggered only after its push was delivered."""
import pytest

from app.services import price_alerts as module
from app.services.price_alerts import PriceAlertService
from tests.fake_supabase import FakeSupabase


def alert(alert_id: str, **extra) -> dict:
    return {
        "id": alert_id, "user_id": "u1", "stock_id": "s1", "group_id": None,
        "condition_type": "price_above", "condition_value": 200, "is_enabled": True,
        "is_triggered": False, "triggered_at": None, "repeat_after_trigger": False,
        "stocks": {"ticker": "AAPL", "name": "Apple", "currency": "USD"}, **extra,
    }


@pytest.fixture
def setup(monkeypatch):
    db = FakeSupabase()
    db.tables["price_alerts"] = [alert("a1")]
    monkeypatch.setattr(module, "supabase", db)
    price = {"value": 210.0}

    async def quotes(_redis, tickers, include_extended=False):
        return {t: {"price": price["value"], "previousClose": 200.0} for t in tickers}

    monkeypatch.setattr(module, "get_quotes", quotes)
    svc = PriceAlertService()
    svc.pushes: list[str] = []
    svc.outcome = True  # True / False / Exception

    async def push(alert_row, current_price, current_value):
        svc.pushes.append(alert_row["id"])
        if isinstance(svc.outcome, Exception):
            raise svc.outcome
        return svc.outcome

    monkeypatch.setattr(svc, "_send_custom_alert_notification", push)
    return svc, db, price


def state(db, alert_id="a1"):
    return next(r for r in db.tables["price_alerts"] if r["id"] == alert_id)


async def test_delivered_alert_is_recorded_as_triggered_and_counted(setup):
    svc, db, _ = setup

    result = await svc.check_custom_alerts(None)

    assert result["alerts_triggered"] == 1
    assert state(db)["is_triggered"] is True and state(db)["triggered_at"] is not None


@pytest.mark.parametrize("outcome", [False, RuntimeError("push service down")])
async def test_undelivered_alert_stays_pending_and_is_not_counted(setup, outcome):
    svc, db, _ = setup
    svc.outcome = outcome

    result = await svc.check_custom_alerts(None)

    assert result["alerts_triggered"] == 0
    assert state(db)["is_triggered"] is False and state(db)["triggered_at"] is None


async def test_next_run_retries_an_undelivered_alert(setup):
    svc, db, _ = setup
    svc.outcome = False
    await svc.check_custom_alerts(None)

    svc.outcome = True
    result = await svc.check_custom_alerts(None)

    assert svc.pushes == ["a1", "a1"]
    assert result["alerts_triggered"] == 1 and state(db)["is_triggered"] is True


async def test_delivered_alert_is_not_sent_again(setup):
    svc, _, _ = setup
    await svc.check_custom_alerts(None)

    await svc.check_custom_alerts(None)

    assert svc.pushes == ["a1"]


async def test_alert_whose_condition_no_longer_holds_is_not_sent_on_retry(setup):
    svc, db, price = setup
    svc.outcome = False
    await svc.check_custom_alerts(None)

    price["value"] = 190.0
    svc.outcome = True
    await svc.check_custom_alerts(None)

    assert svc.pushes == ["a1"] and state(db)["is_triggered"] is False


async def test_delivered_group_is_triggered_as_a_whole(setup):
    svc, db, _ = setup
    db.tables["price_alerts"] = [
        alert("a1", group_id="g1"),
        alert("a2", group_id="g1", condition_type="price_below", condition_value=100),
    ]

    await svc.check_custom_alerts(None)

    assert [r["is_triggered"] for r in db.tables["price_alerts"]] == [True, True]


async def test_undelivered_group_stays_entirely_pending(setup):
    svc, db, _ = setup
    svc.outcome = False
    db.tables["price_alerts"] = [
        alert("a1", group_id="g1"),
        alert("a2", group_id="g1", condition_type="price_below", condition_value=100),
    ]

    await svc.check_custom_alerts(None)

    assert [r["is_triggered"] for r in db.tables["price_alerts"]] == [False, False]


async def test_repeating_alert_is_rearmed_after_delivery(setup):
    svc, db, _ = setup
    db.tables["price_alerts"] = [alert("a1", repeat_after_trigger=True)]

    result = await svc.check_custom_alerts(None)

    assert result["alerts_triggered"] == 1
    assert state(db)["is_triggered"] is False
