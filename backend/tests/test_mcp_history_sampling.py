"""Sampled indicator history for the MCP must still end on the latest row."""
import pytest

from app.services.research_context_market import _pick_technical_history, _slice_history


@pytest.mark.parametrize("size", [10, 30, 31, 59, 60, 63, 90, 250, 500])
def test_sample_keeps_first_and_latest_row_in_order_without_duplicates(size):
    rows = list(range(size))

    sampled = _slice_history(rows)

    assert len(sampled) == min(size, 30)
    assert sampled[0] == 0
    assert sampled[-1] == size - 1
    assert sampled == sorted(set(sampled))


def test_short_history_is_returned_unchanged():
    rows = list(range(12))

    assert _slice_history(rows) == rows


def test_empty_history_stays_empty():
    assert _slice_history([]) == []


def test_sample_is_evenly_spaced():
    sampled = _slice_history(list(range(500)))

    gaps = {b - a for a, b in zip(sampled, sampled[1:])}
    assert max(gaps) - min(gaps) <= 1


def test_technical_history_ends_on_the_latest_date():
    data = {
        "period": "1y",
        "priceHistory": [{"date": f"d{i:03d}", "close": i} for i in range(250)],
        "rsiHistory": [{"date": f"d{i:03d}", "value": i} for i in range(250)],
    }

    history = _pick_technical_history(data, {"price", "rsi"})

    assert history["price"][-1]["date"] == "d249"
    assert history["rsi"][-1]["date"] == "d249"
