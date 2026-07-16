from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class DailyBriefingPreviewResponse(BaseModel):
    id: str
    status: str
    trigger_type: str
    window_start: str
    window_end: str
    title: Optional[str] = None
    summary: Optional[str] = None
    source_counts: dict[str, Any] = Field(default_factory=dict)
    warnings: list[Any] = Field(default_factory=list)
    created_at: Optional[str] = None
    completed_at: Optional[str] = None


class DailyBriefingListResponse(BaseModel):
    generated_at: str
    reports: list[DailyBriefingPreviewResponse] = Field(default_factory=list)


class DailyBriefingContentResponse(DailyBriefingPreviewResponse):
    markdown: Optional[str] = None
    model_used: Optional[str] = None
    scope_snapshot: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    notification_status: Optional[str] = None
    content_format: str = "markdown"


class DailyBriefingSourceResponse(BaseModel):
    id: str
    ticker: Optional[str] = None
    scope_type: str
    scope_priority: Optional[str] = None
    source_type: str
    title: str
    snippet: Optional[str] = None
    url: Optional[str] = None
    source_name: Optional[str] = None
    published_at: Optional[str] = None
    relevance_score: Optional[float] = None
    importance: str
    used_in_prompt: bool = False
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class DailyBriefingSourcesResponse(BaseModel):
    report_id: str
    sources: list[DailyBriefingSourceResponse] = Field(default_factory=list)


__all__ = [
    "DailyBriefingPreviewResponse",
    "DailyBriefingListResponse",
    "DailyBriefingContentResponse",
    "DailyBriefingSourceResponse",
    "DailyBriefingSourcesResponse",
]
