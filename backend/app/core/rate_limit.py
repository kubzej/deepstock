"""Rate limiting configuration using slowapi."""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _get_key(request: Request) -> str:
    """Extract user_id from auth state if available, else fall back to IP."""
    # After auth middleware runs, user_id may be in request state
    auth_header = request.headers.get("authorization", "")
    if auth_header:
        # Use auth header hash as key so each authenticated user gets own bucket
        return str(hash(auth_header))
    return get_remote_address(request)


limiter = Limiter(key_func=_get_key, default_limits=["200/minute"])
