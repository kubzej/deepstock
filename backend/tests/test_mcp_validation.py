import os

import pytest

os.environ["DEBUG"] = "false"

from app.services.research_context import ResearchContextService


@pytest.mark.asyncio
async def test_get_portfolio_performance_rejects_invalid_period():
    service = ResearchContextService()

    with pytest.raises(ValueError, match="Unsupported portfolio performance period"):
        await service.get_portfolio_performance(
            user_id="user-1",
            portfolio_id=None,
            period="10Y",
        )


@pytest.mark.asyncio
async def test_get_technical_history_rejects_invalid_indicators():
    service = ResearchContextService()

    with pytest.raises(ValueError, match="Unsupported technical indicators"):
        await service.get_technical_history(
            ticker="NVDA",
            user_id="user-1",
            period="6mo",
            indicators=["price", "moon_phase"],
        )
