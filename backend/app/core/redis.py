"""
Centralized Redis connection pool.

Benefits:
- Shared connection pool across all services
- Efficient connection reuse
- Configurable pool size
- Singleton pattern ensures single pool instance
"""
import redis.asyncio as redis
from redis.asyncio import ConnectionPool
from typing import Optional
from app.core.config import get_settings

settings = get_settings()

# Global connection pool - shared across all services
_pool: Optional[ConnectionPool] = None


def get_redis_pool() -> ConnectionPool:
    """
    Get or create the global Redis connection pool.
    Uses singleton pattern - creates pool on first call.
    """
    global _pool
    if _pool is None:
        _pool = ConnectionPool.from_url(
            settings.redis_url,
            max_connections=20,  # Max concurrent connections
            decode_responses=False,  # Keep as bytes for json.loads
        )
    return _pool


def get_redis() -> redis.Redis:
    """
    Get a Redis client using the shared connection pool.
    Each call returns a lightweight client bound to the shared pool.
    """
    return redis.Redis(connection_pool=get_redis_pool())


async def close_redis_pool():
    """
    Close the Redis connection pool.
    Call this on application shutdown.
    """
    global _pool
    if _pool:
        await _pool.disconnect()
        _pool = None
