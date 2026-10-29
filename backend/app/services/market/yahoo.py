"""
Gateway for blocking yfinance calls made from async code.

Yahoo rate-limits aggressively. yfinance is synchronous, so a call made directly in a
coroutine blocks the event loop, and that used to be the only thing holding the request
rate down: such calls ran strictly one at a time. Calls now run in worker threads so the
loop stays free, in two lanes whose widths reproduce that ceiling:

- interactive: one worker, for everything a request or job waits on
- background: four workers, for fire-and-forget cache warming (see quotes.py)

Identical calls (same function, same arguments) that overlap share one execution, because
a cache miss that races another miss for the same key must not ask Yahoo twice.

The lanes bound how many calls run at once, not the HTTP requests inside one call:
yf.download fetches every ticker separately, in up to 2x CPU threads of its own.
State is only touched from the event loop thread.

Rules for callers:
- Pass a module-level function that does the blocking yfinance work, plus positional,
  hashable arguments (use tuples, not lists).
- Treat the returned object as read-only: concurrent callers share it.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, Tuple

INTERACTIVE_WORKERS = 1
BACKGROUND_WORKERS = 4


class _Lane:
    def __init__(self, name: str, workers: int):
        self._executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix=f"yahoo-{name}")
        self._in_flight: Dict[Tuple[Callable, tuple], "asyncio.Future[Any]"] = {}

    async def run(self, fn: Callable[..., Any], *args: Any) -> Any:
        key = (fn, args)
        future = self._in_flight.get(key)
        if future is None:
            future = asyncio.get_running_loop().run_in_executor(self._executor, fn, *args)
            self._in_flight[key] = future
            future.add_done_callback(lambda done: self._finished(key, done))
        # Shielded so that one caller giving up does not cancel the call the others wait on
        return await asyncio.shield(future)

    def _finished(self, key: Tuple[Callable, tuple], future: "asyncio.Future[Any]") -> None:
        self._in_flight.pop(key, None)
        if not future.cancelled():
            future.exception()  # mark retrieved: every waiter may already be gone


_interactive = _Lane("interactive", INTERACTIVE_WORKERS)
_background = _Lane("background", BACKGROUND_WORKERS)


async def run_yahoo(fn: Callable[..., Any], *args: Any) -> Any:
    """Run a blocking yfinance function in the interactive lane."""
    return await _interactive.run(fn, *args)


async def run_yahoo_background(fn: Callable[..., Any], *args: Any) -> Any:
    """Run a blocking yfinance function in the background lane."""
    return await _background.run(fn, *args)
