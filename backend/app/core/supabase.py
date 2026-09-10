import httpx
from supabase import Client, ClientOptions, create_client
from app.core.config import get_settings

settings = get_settings()

# Supabase's default sync PostgREST transport uses HTTP/2. Railway production
# has repeatedly received GOAWAY/ConnectionTerminated from that upstream
# connection, after which unrelated API endpoints start returning 500. Use a
# deterministic HTTP/1.1 pool so a terminated multiplexed connection cannot
# take down all concurrent Supabase requests.
_http_client = httpx.Client(
    http2=False,
    follow_redirects=True,
    timeout=httpx.Timeout(30.0, connect=10.0, pool=10.0),
    limits=httpx.Limits(
        max_connections=20,
        max_keepalive_connections=10,
        keepalive_expiry=5.0,
    ),
    transport=httpx.HTTPTransport(retries=2),
)

supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,  # Service role for backend operations
    options=ClientOptions(
        httpx_client=_http_client,
        auto_refresh_token=False,
        persist_session=False,
    ),
)


def close_supabase_client() -> None:
    """Close the shared HTTP connection pool during graceful shutdown."""
    _http_client.close()
