"""API request and response models for market."""
from typing import List
from pydantic import BaseModel


class TickerRequest(BaseModel):
    tickers: List[str]
    include_extended: bool = True


class BatchHistoryRequest(BaseModel):
    tickers: List[str]
    period: str = "1mo"


class BatchEarningsRequest(BaseModel):
    tickers: List[str]


class OptionSymbolsRequest(BaseModel):
    symbols: List[str]
