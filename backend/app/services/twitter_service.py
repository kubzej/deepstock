"""
Twitter service — fetches tweets via twikit using cookie auth + residential proxy.
Sequential per-user to stay within single-account rate limits.
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

# Patch twikit's broken x-client-transaction-id init (twikit 2.3.x regex doesn't
# match Twitter's current webpack chunk format — PRs #410/#412 not yet merged).
# Cookie auth works without a valid transaction ID.
from twikit.x_client_transaction.transaction import ClientTransaction as _CT

async def _noop_ct_init(self, session, headers):
    pass

def _empty_transaction_id(self, method, path, **kwargs):
    return ""

_CT.init = _noop_ct_init
_CT.generate_transaction_id = _empty_transaction_id

import twikit

logger = logging.getLogger(__name__)

MAX_TWEET_AGE_HOURS = 24
MAX_TWEETS_PER_USER = 10


def _parse_tweet_date(raw: str) -> datetime | None:
    """Parse tweet created_at string to timezone-aware datetime."""
    if not raw:
        return None
    # ISO format — covers twikit's "2024-04-06T09:23:50+00:00" and "2024-04-06T09:23:50.000Z"
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    # Twitter v1 format: "Mon Apr 01 00:00:00 +0000 2024"
    try:
        return datetime.strptime(raw, "%a %b %d %H:%M:%S +0000 %Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _normalize_created_at(raw: str) -> str:
    """Ensure created_at starts with YYYY-MM-DD (required by x_feed_prompt.py)."""
    dt = _parse_tweet_date(raw)
    if dt:
        return dt.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    return raw


def _build_client() -> twikit.Client:
    auth_token = os.getenv("TWITTER_AUTH_TOKEN", "")
    ct0 = os.getenv("TWITTER_CT0", "")
    proxy_url = os.getenv("PROXY_URL", "")

    client = twikit.Client(language="en-US", proxy=proxy_url or None)
    client.set_cookies({"auth_token": auth_token, "ct0": ct0})
    return client


async def _fetch_user_tweets(client: twikit.Client, username: str) -> tuple[str, list[dict]]:
    """Fetch up to MAX_TWEETS_PER_USER tweets for a single user."""
    try:
        user = await client.get_user_by_screen_name(username)
        raw_tweets = await client.get_user_tweets(user.id, "Tweets", count=MAX_TWEETS_PER_USER)
        tweets = []
        for tweet in raw_tweets:
            tweets.append({
                "text": tweet.text,
                "created_at": _normalize_created_at(tweet.created_at or ""),
                "url": f"https://x.com/{tweet.user.screen_name}/status/{tweet.id}",
                "author": {"name": tweet.user.name, "displayName": tweet.user.name},
            })
        logger.info(f"@{username}: {len(tweets)} tweets fetched")
        return username.lower(), tweets
    except Exception as e:
        logger.error(f"Failed to fetch tweets for @{username}: {e}", exc_info=True)
        return username.lower(), []


async def fetch_tweets_for_list(usernames: list[str]) -> dict[str, list[dict]]:
    """Fetch tweets for all usernames sequentially (single-account rate limits). Returns {username: [tweets]}."""
    if not usernames:
        return {}

    client = _build_client()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=MAX_TWEET_AGE_HOURS)

    result: dict[str, list[dict]] = {}
    for i, username in enumerate(usernames):
        if i > 0:
            await asyncio.sleep(0.5)
        key, tweets = await _fetch_user_tweets(client, username)
        filtered = []
        for tweet in tweets:
            dt = _parse_tweet_date(tweet["created_at"])
            if dt is None or dt >= cutoff:
                filtered.append(tweet)
        result[key] = filtered

    total = sum(len(v) for v in result.values())
    logger.info(f"Fetched {total} tweets for {len(usernames)} users (last {MAX_TWEET_AGE_HOURS}h)")
    return result
