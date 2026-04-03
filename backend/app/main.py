from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
import os
import logging
import yfinance as yf
from app.api.endpoints import market, portfolio, stocks, watchlists, options, push, cron, insider, alerts, ai_research, ai_alerts, ai_portfolio, ai_watchlist, feed, journal
from app.core.redis import close_redis_pool
from app.core.rate_limit import limiter

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown events."""
    # Startup
    logger.info("Starting DeepStock API with yfinance %s", yf.__version__)
    yield
    # Shutdown - close Redis connection pool
    await close_redis_pool()


app = FastAPI(title="DeepStock API", lifespan=lifespan)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS setup - allow frontend origins
allowed_origins = [
    "http://localhost:5173",
]

# Add production frontend URL from environment
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "DeepStock API"}

# Include routers
app.include_router(market.router, prefix="/api/market", tags=["Market Data"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(stocks.router, prefix="/api", tags=["Stocks"])
app.include_router(watchlists.router, prefix="/api/watchlists", tags=["Watchlists"])
app.include_router(options.router, prefix="/api/options", tags=["Options"])
app.include_router(push.router, prefix="/api/push", tags=["Push Notifications"])
app.include_router(insider.router, prefix="/api/insider", tags=["Insider Trading"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Price Alerts"])
app.include_router(cron.router, prefix="/api/cron", tags=["Cron Jobs"])
app.include_router(ai_research.router, prefix="/api/ai", tags=["AI Research"])
app.include_router(ai_alerts.router, prefix="/api/ai", tags=["AI Alerts"])
app.include_router(ai_portfolio.router, prefix="/api/ai", tags=["AI Portfolio"])
app.include_router(ai_watchlist.router, prefix="/api/ai", tags=["AI Watchlist"])
app.include_router(feed.router, prefix="/api/feed", tags=["Feed"])
app.include_router(journal.router, prefix="/api/journal", tags=["Journal"])
