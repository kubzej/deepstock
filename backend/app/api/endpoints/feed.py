"""
Feed endpoints — list CRUD + AI summary generation.

GET    /api/feed/lists
POST   /api/feed/lists
PATCH  /api/feed/lists/{list_id}
DELETE /api/feed/lists/{list_id}
POST   /api/feed/lists/{list_id}/accounts
DELETE /api/feed/lists/{list_id}/accounts/{username}
POST   /api/feed/lists/{list_id}/summary
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user_id
from app.core.redis import get_redis
from app.services.feed_service import feed_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class FeedListCreate(BaseModel):
    name: str
    description: Optional[str] = None


class FeedListUpdate(BaseModel):
    name: str
    description: Optional[str] = None


class AddAccountRequest(BaseModel):
    username: str


class FeedSummaryResponse(BaseModel):
    markdown: str
    cached: bool = False
    generated_at: str
    model_used: str = ""


# ── List CRUD ──────────────────────────────────────────────────────────────────

@router.get("/lists")
async def get_feed_lists(user_id: str = Depends(get_current_user_id)):
    return await feed_service.get_lists(user_id)


@router.post("/lists", status_code=201)
async def create_feed_list(
    payload: FeedListCreate,
    user_id: str = Depends(get_current_user_id),
):
    return await feed_service.create_list(user_id, payload.name, payload.description)


@router.patch("/lists/{list_id}")
async def update_feed_list(
    list_id: str,
    payload: FeedListUpdate,
    user_id: str = Depends(get_current_user_id),
):
    lst = await feed_service.get_list(list_id, user_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Seznam nenalezen.")
    return await feed_service.update_list(list_id, user_id, payload.name, payload.description)


@router.delete("/lists/{list_id}", status_code=204)
async def delete_feed_list(
    list_id: str,
    user_id: str = Depends(get_current_user_id),
):
    lst = await feed_service.get_list(list_id, user_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Seznam nenalezen.")
    await feed_service.delete_list(list_id, user_id)


# ── Accounts ───────────────────────────────────────────────────────────────────

@router.post("/lists/{list_id}/accounts", status_code=201)
async def add_account(
    list_id: str,
    payload: AddAccountRequest,
    user_id: str = Depends(get_current_user_id),
):
    lst = await feed_service.get_list(list_id, user_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Seznam nenalezen.")
    try:
        return await feed_service.add_account(list_id, payload.username)
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Účet je již v seznamu.")
        raise HTTPException(status_code=500, detail="Chyba při přidávání účtu.")


@router.delete("/lists/{list_id}/accounts/{username}", status_code=204)
async def remove_account(
    list_id: str,
    username: str,
    user_id: str = Depends(get_current_user_id),
):
    lst = await feed_service.get_list(list_id, user_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Seznam nenalezen.")
    await feed_service.remove_account(list_id, username)


# ── AI Summary ─────────────────────────────────────────────────────────────────

@router.get("/lists/{list_id}/summary", response_model=FeedSummaryResponse)
async def get_feed_summary(
    list_id: str,
    user_id: str = Depends(get_current_user_id),
):
    redis = get_redis()
    cache_key = f"feed_summary:{user_id}:{list_id}"
    cached = await redis.get(cache_key)
    if not cached:
        raise HTTPException(status_code=404, detail="Žádný uložený přehled.")
    data = json.loads(cached)
    return FeedSummaryResponse(**data, cached=True)


@router.post("/lists/{list_id}/summary", response_model=FeedSummaryResponse)
async def generate_feed_summary(
    list_id: str,
    force: bool = False,
    user_id: str = Depends(get_current_user_id),
):
    lst = await feed_service.get_list(list_id, user_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Seznam nenalezen.")

    usernames = await feed_service.get_usernames(list_id)
    if not usernames:
        raise HTTPException(status_code=400, detail="Seznam neobsahuje žádné účty.")

    # Cache 6 hours
    redis = get_redis()
    cache_key = f"feed_summary:{user_id}:{list_id}"
    if not force:
        cached = await redis.get(cache_key)
        if cached:
            data = json.loads(cached)
            return FeedSummaryResponse(**data, cached=True)

    # Fetch tweets
    from app.services.apify_service import fetch_tweets_for_list
    try:
        tweets_by_user = await fetch_tweets_for_list(usernames)
    except Exception as e:
        logger.error(f"Apify fetch failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="Nepodařilo se načíst tweety. Zkus to znovu.")

    # Guard: skip LLM if no tweets were fetched
    total_tweets = sum(len(v) for v in tweets_by_user.values())
    if total_tweets == 0:
        raise HTTPException(status_code=422, detail="Nepodařilo se načíst žádné tweety pro tuto skupinu účtů.")

    # Build prompt + call LLM
    from app.ai.prompts.x_feed_prompt import SYSTEM_PROMPT, build_user_prompt
    from app.ai.providers.litellm_client import call_llm

    user_prompt = build_user_prompt(lst["name"], tweets_by_user, lst.get("description"))

    try:
        content, model_used = await call_llm(SYSTEM_PROMPT, user_prompt)
    except ValueError as e:
        raise HTTPException(status_code=402, detail=str(e))
    except Exception as e:
        logger.error(f"LLM error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Chyba při generování souhrnu.")

    generated_at = datetime.now(timezone.utc).isoformat()
    result = {"markdown": content, "generated_at": generated_at, "model_used": model_used}

    await redis.set(cache_key, json.dumps(result), ex=6 * 3600)

    return FeedSummaryResponse(**result, cached=False)
