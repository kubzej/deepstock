"""
Apify service — fetches tweets via kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest.
Per-user calls to guarantee equal tweet distribution across all accounts.
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

import httpx

logger = logging.getLogger(__name__)

APIFY_TOKEN = os.getenv("APIFY_API_TOKEN")
ACTOR_ID = "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest"
ACTOR_URL = f"https://api.apify.com/v2/acts/{ACTOR_ID}/run-sync-get-dataset-items"
MAX_TWEET_AGE_HOURS = 24
MAX_TWEETS_PER_USER = 10


async def _fetch_user_tweets(client: httpx.AsyncClient, username: str) -> tuple[str, list[dict]]:
    """Fetch up to MAX_TWEETS_PER_USER tweets for a single user."""
    payload = {
        "from": username,
        "maxItems": MAX_TWEETS_PER_USER,
        "queryType": "Latest",
        "filter:has_engagement": True,
    }
    try:
        resp = await client.post(ACTOR_URL, json=payload, params={"token": APIFY_TOKEN})
        resp.raise_for_status()
        data = resp.json()
        tweets = data if isinstance(data, list) else []
        logger.info(f"@{username}: {len(tweets)} tweets fetched")
        return username.lower(), tweets
    except Exception as e:
        logger.error(f"Failed to fetch tweets for @{username}: {e}", exc_info=True)
        return username.lower(), []


async def fetch_tweets_for_list(usernames: list[str]) -> dict[str, list[dict]]:
    """Fetch tweets for all usernames in parallel (one call per user). Returns {username: [tweets]}."""
    if not usernames:
        return {}

    since_date = (datetime.now(timezone.utc) - timedelta(hours=MAX_TWEET_AGE_HOURS)).strftime("%Y-%m-%d")

    async with httpx.AsyncClient(timeout=60.0) as client:
        tasks = [_fetch_user_tweets(client, u) for u in usernames]
        results = await asyncio.gather(*tasks)

    cutoff = datetime.now(timezone.utc) - timedelta(hours=MAX_TWEET_AGE_HOURS)
    result: dict[str, list[dict]] = {}
    for username, tweets in results:
        filtered = []
        for tweet in tweets:
            raw = tweet.get("createdAt") or ""
            try:
                dt = datetime.strptime(raw, "%a %b %d %H:%M:%S +0000 %Y").replace(tzinfo=timezone.utc)
                if dt >= cutoff:
                    filtered.append(tweet)
            except ValueError:
                filtered.append(tweet)  # keep if date unparseable
        result[username] = filtered
    total = sum(len(v) for v in result.values())
    logger.info(f"Fetched {total} tweets for {len(usernames)} users (last {MAX_TWEET_AGE_HOURS}h)")
    return result
