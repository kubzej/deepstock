"""API request and response models for feed."""
from typing import Optional
from pydantic import BaseModel


class FeedListCreate(BaseModel):
    name: str
    description: Optional[str] = None


class FeedListUpdate(BaseModel):
    name: str
    description: Optional[str] = None


class AddAccountRequest(BaseModel):
    username: str


class FeedSummaryResponse(BaseModel):
    markdown: str
    cached: bool = False
    generated_at: str
    model_used: str = ""
