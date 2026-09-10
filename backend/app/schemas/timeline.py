from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


TimelineEventType = Literal['daily_briefing', 'earnings', 'option_expiry']


class TimelineEvent(BaseModel):
    id: str
    event_type: TimelineEventType
    event_date: date
    title: str
    subtitle: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    briefing_report_id: str | None = None
    created_at: datetime


class TimelineResponse(BaseModel):
    events: list[TimelineEvent] = Field(default_factory=list)
    next_cursor: str | None = None
    has_more: bool = False
