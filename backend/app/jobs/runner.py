"""CLI runner for Railway cron and manual scheduled jobs."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from collections.abc import Awaitable, Callable
from typing import Any

from app.core.redis import close_redis_pool
from app.jobs import scheduled

logger = logging.getLogger(__name__)

JobHandler = Callable[[], Awaitable[dict[str, Any]]]

JOB_HANDLERS: dict[str, JobHandler] = {
    "price-target-alerts": scheduled.run_price_target_alerts,
    "custom-price-alerts": scheduled.run_custom_price_alerts,
    "earnings-alerts": scheduled.run_earnings_alerts,
    "refresh-earnings-calendar": scheduled.run_refresh_earnings_calendar,
    "refresh-earnings-calendar-force": scheduled.run_refresh_earnings_calendar_force,
    "cleanup-earnings-calendar": scheduled.run_cleanup_earnings_calendar,
    "daily-news-briefing": scheduled.run_daily_news_briefing,
}


async def run_job(job_name: str) -> dict[str, Any]:
    """Run a named job and always close shared async resources."""
    handler = JOB_HANDLERS.get(job_name)
    if handler is None:
        raise ValueError(f"Unknown job: {job_name}")

    try:
        logger.info("Running job %s", job_name)
        return await handler()
    finally:
        await close_redis_pool()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a DeepStock scheduled job")
    parser.add_argument("job", choices=sorted(JOB_HANDLERS), help="Job to run")
    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO)
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        result = asyncio.run(run_job(args.job))
    except Exception:
        logger.exception("Job %s failed", args.job)
        return 1

    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
