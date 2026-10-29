"""API request and response models for journal."""
from typing import Optional
from pydantic import BaseModel


class SectionCreate(BaseModel):
    name: str
    color: str = "#6b7280"
    sort_order: int = 0


class SectionUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class ChannelCreate(BaseModel):
    name: str
    section_id: Optional[str] = None
    sort_order: int = 0


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    section_id: Optional[str] = None
    sort_order: Optional[int] = None


class EntryCreate(BaseModel):
    channel_id: str
    type: str  # note | ai_report | ext_ref
    content: str
    metadata: dict = {}


class EntryUpdate(BaseModel):
    content: str
