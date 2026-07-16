from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


Priority = Literal["high", "medium", "low"]
ScopeSourceType = Literal["portfolio", "watchlist"]
ReportStatus = Literal["running", "succeeded", "degraded", "failed"]
TriggerType = Literal["scheduled", "manual"]
SourceScopeType = Literal["holding", "watchlist", "market", "macro", "sector"]
DailyNewsSourceType = Literal["marketaux", "edgar", "deepstock_market"]
Importance = Literal["high", "medium", "low", "noise"]


class DailyBriefingSettings(BaseModel):
    user_id: str
    enabled: bool
    include_market_context: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DailyBriefingSettingsUpdate(BaseModel):
    enabled: bool
    include_market_context: bool = True


class DailyBriefingScopeItem(BaseModel):
    id: Optional[str] = None
    user_id: Optional[str] = None
    source_type: ScopeSourceType
    source_id: str
    enabled: bool = True
    priority: Priority = "medium"
    source_name: Optional[str] = None
    item_count: Optional[int] = None


class DailyBriefingScopeUpdate(BaseModel):
    items: list[DailyBriefingScopeItem] = Field(default_factory=list)


class DailyBriefingScopeOption(BaseModel):
    id: str
    source_type: ScopeSourceType
    name: str
    description: Optional[str] = None
    item_count: int = 0


class DailyBriefingScopeOptions(BaseModel):
    portfolios: list[DailyBriefingScopeOption]
    watchlists: list[DailyBriefingScopeOption]
    selected_items: list[DailyBriefingScopeItem]


class DailyNewsReport(BaseModel):
    id: str
    user_id: str
    status: ReportStatus
    trigger_type: TriggerType
    window_start: datetime
    window_end: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    markdown: Optional[str] = None
    model_used: Optional[str] = None
    scope_snapshot: dict[str, Any] = Field(default_factory=dict)
    source_counts: dict[str, Any] = Field(default_factory=dict)
    warnings: list[Any] = Field(default_factory=list)
    error: Optional[str] = None
    notification_status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DailyNewsReportList(BaseModel):
    reports: list[DailyNewsReport]
    limit: int
    offset: int


class DailyNewsSourceItem(BaseModel):
    id: str
    user_id: str
    report_id: str
    ticker: Optional[str] = None
    scope_type: SourceScopeType
    scope_priority: Optional[Priority] = None
    source_type: DailyNewsSourceType
    title: str
    snippet: Optional[str] = None
    url: Optional[str] = None
    source_name: Optional[str] = None
    published_at: Optional[datetime] = None
    relevance_score: Optional[float] = None
    importance: Importance
    used_in_prompt: bool = False
    dedupe_key: Optional[str] = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DailyNewsSourceList(BaseModel):
    sources: list[DailyNewsSourceItem]


class GenerateDailyBriefingResponse(BaseModel):
    report_id: str
    status: ReportStatus
