"""The account-wide notifications flag follows the registered devices, never one device's switch."""
from types import SimpleNamespace

import pytest
from pywebpush import WebPushException

from app.schemas.push import NotificationSettingsUpdate
from app.services import push
from tests.fake_supabase import FakeSupabase


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    fake.tables["profiles"] = [{"id": "u1", "notifications_enabled": False}, {"id": "u2", "notifications_enabled": True}]
    fake.tables["push_subscriptions"] = []
    monkeypatch.setattr(push, "supabase", fake)
    return fake


def enabled(db, user="u1"):
    return next(p for p in db.tables["profiles"] if p["id"] == user)["notifications_enabled"]


def register(endpoint, user="u1"):
    push.subscribe_user(user, endpoint, "p256dh", "auth")


def test_registering_the_first_device_enables_notifications(db):
    register("https://push/mac")

    assert enabled(db) is True


def test_removing_one_of_several_devices_keeps_notifications_on(db):
    register("https://push/mac")
    register("https://push/phone")

    push.unsubscribe_user("u1", "https://push/mac")

    assert enabled(db) is True
    assert [s["endpoint"] for s in db.tables["push_subscriptions"]] == ["https://push/phone"]


def test_removing_the_last_device_turns_notifications_off(db):
    register("https://push/mac")
    register("https://push/phone")

    push.unsubscribe_user("u1", "https://push/mac")
    push.unsubscribe_user("u1", "https://push/phone")

    assert enabled(db) is False


def test_registering_the_same_device_twice_is_one_device(db):
    register("https://push/mac")
    register("https://push/mac")

    assert len(db.tables["push_subscriptions"]) == 1 and enabled(db) is True


def test_another_users_devices_and_flag_are_untouched(db):
    register("https://push/mac")
    register("https://push/other", user="u2")

    push.unsubscribe_user("u1", "https://push/mac")

    assert enabled(db, "u1") is False and enabled(db, "u2") is True


def expired(status):
    return WebPushException("gone", response=SimpleNamespace(status_code=status))


@pytest.fixture
def sending(monkeypatch, db):
    monkeypatch.setattr(push, "get_settings", lambda: SimpleNamespace(vapid_private_key="key", vapid_claim_email="a@b.c"))
    outcomes = {}

    def fake_webpush(subscription_info, **_kwargs):
        outcome = outcomes.get(subscription_info["endpoint"])
        if outcome:
            raise outcome

    monkeypatch.setattr(push, "webpush", fake_webpush)
    return outcomes


def test_an_expired_device_is_dropped_and_the_others_keep_notifications_on(db, sending):
    register("https://push/mac")
    register("https://push/phone")
    sending["https://push/mac"] = expired(410)

    delivered = push.send_push_notification("u1", "t", "b")

    assert delivered == 1 and enabled(db) is True
    assert [s["endpoint"] for s in db.tables["push_subscriptions"]] == ["https://push/phone"]


def test_when_the_last_device_has_expired_notifications_turn_off(db, sending):
    register("https://push/mac")
    sending["https://push/mac"] = expired(404)

    assert push.send_push_notification("u1", "t", "b") == 0

    assert enabled(db) is False and db.tables["push_subscriptions"] == []


def test_a_failed_send_that_is_not_an_expiry_keeps_the_device(db, sending):
    register("https://push/mac")
    sending["https://push/mac"] = expired(500)

    assert push.send_push_notification("u1", "t", "b") == 0

    assert enabled(db) is True and len(db.tables["push_subscriptions"]) == 1


def test_settings_cannot_set_the_flag_directly():
    update = NotificationSettingsUpdate(notifications_enabled=False, alert_buy_enabled=True)

    assert update.model_dump(exclude_unset=True) == {"alert_buy_enabled": True}
