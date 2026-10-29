"""Blocking yfinance calls run in worker threads: loop stays free, concurrency never exceeds the old ceiling."""
import asyncio
import threading
import time

import pytest

from app.services.market import yahoo
from app.services.market.yahoo import run_yahoo, run_yahoo_background


class Probe:
    """Blocking functions that record how many ran at once and how often each was executed."""

    def __init__(self, duration: float = 0.05):
        self.duration = duration
        self.active = 0
        self.peak = 0
        self.executions = 0
        self.lock = threading.Lock()

    def work(self, label):
        with self.lock:
            self.executions += 1
            self.active += 1
            self.peak = max(self.peak, self.active)
        time.sleep(self.duration)
        with self.lock:
            self.active -= 1
        return label


def thread_name(_label=None):
    return threading.current_thread().name


async def test_event_loop_keeps_running_during_a_slow_call():
    ticks = 0

    async def ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    task = asyncio.create_task(ticker())
    await run_yahoo(time.sleep, 0.3)
    task.cancel()

    assert ticks >= 10  # a blocked loop would have counted none


async def test_interactive_lane_runs_one_call_at_a_time():
    probe = Probe()

    results = await asyncio.gather(*[run_yahoo(probe.work, label) for label in range(6)])

    assert results == list(range(6))
    assert probe.peak == yahoo.INTERACTIVE_WORKERS == 1


async def test_background_lane_runs_at_most_four_at_a_time():
    probe = Probe()

    await asyncio.gather(*[run_yahoo_background(probe.work, label) for label in range(12)])

    assert probe.peak == yahoo.BACKGROUND_WORKERS == 4


async def test_busy_interactive_lane_does_not_hold_up_the_background_lane():
    release = threading.Event()
    blocker = asyncio.create_task(run_yahoo(release.wait, 5))
    try:
        result = await asyncio.wait_for(run_yahoo_background(thread_name), timeout=1)
    finally:
        release.set()
        await blocker

    assert result.startswith("yahoo-background")


async def test_calls_run_in_a_worker_thread_named_after_their_lane():
    interactive = await run_yahoo(thread_name)
    background = await run_yahoo_background(thread_name)

    assert interactive.startswith("yahoo-interactive") and background.startswith("yahoo-background")
    assert threading.current_thread().name not in (interactive, background)


async def test_overlapping_identical_calls_run_once_and_share_the_result():
    probe = Probe(duration=0.1)

    results = await asyncio.gather(*[run_yahoo(probe.work, "AAPL") for _ in range(5)])

    assert probe.executions == 1
    assert results == ["AAPL"] * 5


async def test_calls_with_different_arguments_are_not_merged():
    probe = Probe()

    await asyncio.gather(run_yahoo(probe.work, "AAPL"), run_yahoo(probe.work, "MSFT"))

    assert probe.executions == 2


async def test_different_functions_with_the_same_arguments_are_not_merged():
    first, second = Probe(), Probe()

    await asyncio.gather(run_yahoo(first.work, "AAPL"), run_yahoo(second.work, "AAPL"))

    assert (first.executions, second.executions) == (1, 1)


async def test_the_same_call_in_the_other_lane_is_not_merged():
    probe = Probe(duration=0.1)

    await asyncio.gather(run_yahoo(probe.work, "AAPL"), run_yahoo_background(probe.work, "AAPL"))

    assert probe.executions == 2


async def test_a_finished_call_is_executed_again_next_time():
    probe = Probe()

    await run_yahoo(probe.work, "AAPL")
    await run_yahoo(probe.work, "AAPL")

    assert probe.executions == 2


async def test_failure_reaches_every_waiter_and_is_not_remembered():
    attempts = []

    def flaky(_label):
        attempts.append(1)
        time.sleep(0.05)
        if len(attempts) == 1:
            raise RuntimeError("yahoo says no")
        return "recovered"

    first = await asyncio.gather(*[run_yahoo(flaky, "AAPL") for _ in range(3)], return_exceptions=True)
    second = await run_yahoo(flaky, "AAPL")

    assert [type(r) for r in first] == [RuntimeError] * 3
    assert len(attempts) == 2 and second == "recovered"


async def test_one_waiter_giving_up_does_not_cancel_the_call_for_the_others():
    started, release = threading.Event(), threading.Event()
    executions = []

    def slow(label):
        executions.append(label)
        started.set()
        release.wait(5)
        return label

    impatient = asyncio.create_task(run_yahoo(slow, "AAPL"))
    patient = asyncio.create_task(run_yahoo(slow, "AAPL"))
    await asyncio.get_running_loop().run_in_executor(None, started.wait, 5)
    impatient.cancel()
    release.set()

    assert await patient == "AAPL"
    assert executions == ["AAPL"]
    with pytest.raises(asyncio.CancelledError):
        await impatient


async def test_arguments_must_be_hashable():
    with pytest.raises(TypeError):
        await run_yahoo(thread_name, ["AAPL"])
