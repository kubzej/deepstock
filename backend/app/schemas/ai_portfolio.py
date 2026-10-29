"""API request and response models for ai portfolio."""
from typing import Optional
from pydantic import BaseModel


class PortfolioAdvisorRequest(BaseModel):
    portfolio_id: Optional[str] = None
    force_refresh: bool = False


class PortfolioAdvisorResponse(BaseModel):
    markdown: str
    cached: bool = False
    generated_at: str
    model_used: str = ""
