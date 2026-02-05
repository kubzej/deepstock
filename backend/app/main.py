from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from app.api.endpoints import market, portfolio, stocks, watchlists

app = FastAPI(title="DeepStock API")

# CORS setup - allow frontend origins
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
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
