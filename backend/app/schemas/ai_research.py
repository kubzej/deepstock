"""API request and response models for ai research."""
from typing import Literal
from app.services.market.technical import TechnicalPeriod
from pydantic import BaseModel


class GenerateReportRequest(BaseModel):
    current_price: float
    report_type: Literal["full_analysis", "technical_analysis", "earnings"] = "full_analysis"
    force_refresh: bool = False
    period: TechnicalPeriod = "3mo"  # used only for technical_analysis
