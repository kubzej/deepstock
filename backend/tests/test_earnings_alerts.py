"""An earnings alert is deduplicated only once it was actually delivered."""
import pytest

from app.services.earnings_alerts import EarningsAlertService

TODAY = "2026-10-29"


class FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True

    async def delete(self, key):
        self.store.pop(key, None)


@pytest.fixture
def service(monkeypatch):
    svc = EarningsAlertService()
    svc.sent: list[str] = []
    svc.outcomes: dict[str, object] = {}  # ticker -> True / False / Exception

    async def todays(user_id, today_str):
        return [{"ticker": t, "name": t} for t in ("AAPL", "MSFT")]

    async def send(user_id, stock):
        svc.sent.append(stock["ticker"])
        outcome = svc.outcomes.get(stock["ticker"], True)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(svc, "_get_user_earnings_today", todays)
    monkeypatch.setattr(svc, "_send_earnings_alert", send)
    return svc


async def run(service, redis):
    return await service.check_user_earnings(redis, "u1", TODAY)


async def test_delivered_alert_is_not_sent_again_the_same_day(service):
    redis = FakeRedis()

    assert await run(service, redis) == 2
    assert await run(service, redis) == 0

    assert service.sent == ["AAPL", "MSFT"]


async def test_undelivered_alert_is_retried_by_the_next_run(service):
    redis = FakeRedis()
    service.outcomes["AAPL"] = False

    assert await run(service, redis) == 1
    service.outcomes["AAPL"] = True
    assert await run(service, redis) == 1

    assert service.sent == ["AAPL", "MSFT", "AAPL"]


async def test_failing_push_does_not_stop_the_other_tickers_and_is_retried(service):
    redis = FakeRedis()
    service.outcomes["AAPL"] = RuntimeError("push service down")

    assert await run(service, redis) == 1  # MSFT still went out
    service.outcomes["AAPL"] = True
    assert await run(service, redis) == 1

    assert service.sent == ["AAPL", "MSFT", "AAPL"]


async def test_already_claimed_ticker_is_not_sent(service):
    redis = FakeRedis()
    redis.store[f"earnings_alert:u1:AAPL:{TODAY}"] = "1"

    assert await run(service, redis) == 1

    assert service.sent == ["MSFT"]


async def test_claim_is_per_user_ticker_and_day(service):
    redis = FakeRedis()

    await run(service, redis)

    assert sorted(redis.store) == [f"earnings_alert:u1:AAPL:{TODAY}", f"earnings_alert:u1:MSFT:{TODAY}"]
