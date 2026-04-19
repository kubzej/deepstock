"""
MCP journal-related schemas.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class JournalNotePreviewResponse(BaseModel):
    id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    type: str = "note"
    preview: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class AIReportPreviewResponse(BaseModel):
    id: Optional[str] = None
    created_at: Optional[str] = None
    report_type: Optional[str] = None
    model: Optional[str] = None
    preview: str = ""
    content_length: int = 0


class JournalContextSummaryResponse(BaseModel):
    note_count: int = 0
    report_count: int = 0
    latest_note_at: Optional[str] = None
    latest_report_at: Optional[str] = None
    has_more_notes: bool = False
    has_more_reports: bool = False
    notes: list[JournalNotePreviewResponse] = Field(default_factory=list)
    reports: list[AIReportPreviewResponse] = Field(default_factory=list)


class StockJournalArchiveResponse(BaseModel):
    ticker: str
    generated_at: str
    reports: list[AIReportPreviewResponse] = Field(default_factory=list)
    notes: list[JournalNotePreviewResponse] = Field(default_factory=list)


class PortfolioJournalArchiveResponse(BaseModel):
    portfolio_id: str
    portfolio_name: str
    generated_at: str
    reports: list[AIReportPreviewResponse] = Field(default_factory=list)
    notes: list[JournalNotePreviewResponse] = Field(default_factory=list)


class JournalReportContentResponse(BaseModel):
    id: str
    created_at: Optional[str] = None
    report_type: Optional[str] = None
    model: Optional[str] = None
    content: str = ""
    content_format: Literal["markdown"] = "markdown"


class JournalNoteContentResponse(BaseModel):
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    type: str = "note"
    content: str = ""
    content_format: Literal["plain_text"] = "plain_text"
    metadata: dict[str, Any] = Field(default_factory=dict)


class SaveStockJournalNoteRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=20)
    content: str = Field(min_length=1, max_length=10000)

    @field_validator("ticker")
    @classmethod
    def validate_ticker(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Ticker cannot be empty")
        return normalized

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Content cannot be empty")
        return stripped


class SaveStockJournalNoteResponse(BaseModel):
    entry_id: str
    ticker: str
    channel_id: str
    created_at: Optional[str] = None
    content: str
    content_format: Literal["plain_text"] = "plain_text"
    metadata: dict[str, Any] = Field(default_factory=dict)


class SavePortfolioJournalNoteRequest(BaseModel):
    portfolio_id: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=10000)

    @field_validator("portfolio_id")
    @classmethod
    def validate_portfolio_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Portfolio ID cannot be empty")
        return normalized

    @field_validator("content")
    @classmethod
    def validate_portfolio_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Content cannot be empty")
        return stripped


class SavePortfolioJournalNoteResponse(BaseModel):
    entry_id: str
    portfolio_id: str
    portfolio_name: str
    channel_id: str
    created_at: Optional[str] = None
    content: str
    content_format: Literal["plain_text"] = "plain_text"
    metadata: dict[str, Any] = Field(default_factory=dict)


__all__ = [
    "JournalNotePreviewResponse",
    "AIReportPreviewResponse",
    "JournalContextSummaryResponse",
    "StockJournalArchiveResponse",
    "PortfolioJournalArchiveResponse",
    "JournalReportContentResponse",
    "JournalNoteContentResponse",
    "SaveStockJournalNoteRequest",
    "SaveStockJournalNoteResponse",
    "SavePortfolioJournalNoteRequest",
    "SavePortfolioJournalNoteResponse",
]
