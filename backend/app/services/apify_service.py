"""
Apify service — fetches tweets via oavivo/cheap-simple-twitter-api actor.
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

import httpx

logger = logging.getLogger(__name__)

APIFY_TOKEN = os.getenv("APIFY_API_TOKEN")
ACTOR_ID = "gdN28kzr6QsU4nVh8"
ACTOR_URL = f"https://api.apify.com/v2/acts/{ACTOR_ID}/run-sync-get-dataset-items"
MAX_TWEET_AGE_HOURS = 48


def _parse_tweet_date(tweet: dict) -> datetime | None:
    raw = tweet.get("created_at") or tweet.get("createdAt") or ""
    if not raw:
        return None
    for fmt in ("%a %b %d %H:%M:%S +0000 %Y", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


async def fetch_user_tweets(username: str) -> list[dict]:
    """Fetch recent tweets from a single X/Twitter user, filtered to last 48 hours."""
    payload = {
        "endpoint": "user/last_tweets",
        "parameters": {"userName": username},
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            ACTOR_URL,
            json=payload,
            params={"token": APIFY_TOKEN},
        )
        resp.raise_for_status()
        data = resp.json()
        logger.debug(f"Apify response for @{username}: type={type(data)}, len={len(data) if isinstance(data, list) else 'n/a'}, sample={str(data[0])[:200] if isinstance(data, list) and data else data}")
        if not isinstance(data, list):
            return []

    cutoff = datetime.now(timezone.utc) - timedelta(hours=MAX_TWEET_AGE_HOURS)
    filtered = []
    for tweet in data:
        dt = _parse_tweet_date(tweet)
        if dt is None or dt >= cutoff:
            filtered.append(tweet)
        else:
            logger.debug(f"Skipping old tweet from @{username}: {dt.isoformat()}")

    logger.info(f"@{username}: {len(data)} tweets fetched, {len(filtered)} within {MAX_TWEET_AGE_HOURS}h")
    return filtered


async def fetch_tweets_for_list(usernames: list[str]) -> dict[str, list[dict]]:
    """Fetch tweets for all usernames in parallel. Returns {username: [tweets]}."""
    tasks = [fetch_user_tweets(u) for u in usernames]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    output: dict[str, list[dict]] = {}
    for username, result in zip(usernames, results):
        if isinstance(result, Exception):
            logger.warning(f"Failed to fetch tweets for @{username}: {result}")
            output[username] = []
        else:
            output[username] = result
    return output
