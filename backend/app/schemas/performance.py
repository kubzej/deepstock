"""API request and response models for performance."""
from typing import List, Optional
from pydantic import BaseModel


class PerformancePoint(BaseModel):
    date: str
    value: float
    # Cost basis of the shares held that day; the same figure as "Investováno" on the Přehled
    invested: float
    benchmark: Optional[float] = None


class PerformanceResult(BaseModel):
    data: List[PerformancePoint]
    total_return: float
    total_return_pct: float
    benchmark_return_pct: Optional[float] = None
