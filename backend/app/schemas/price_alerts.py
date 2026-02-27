"""
Price Alert Schemas

Pydantic models for price alert API endpoints.
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


class PriceAlertBase(BaseModel):
    """Base schema for price alerts."""
    stock_id: str
    condition_type: Literal['price_above', 'price_below', 'percent_change_day']
    condition_value: float = Field(..., gt=0, description="Target price or percentage")
    is_enabled: bool = True
    repeat_after_trigger: bool = False
    notes: Optional[str] = None
    group_id: Optional[str] = Field(None, description="UUID to link alerts together (e.g., price range)")


class PriceAlertCreate(PriceAlertBase):
    """Schema for creating a new price alert."""
    pass


class PriceAlertUpdate(BaseModel):
    """Schema for updating an existing price alert."""
    condition_type: Optional[Literal['price_above', 'price_below', 'percent_change_day']] = None
    condition_value: Optional[float] = Field(None, gt=0)
    is_enabled: Optional[bool] = None
    repeat_after_trigger: Optional[bool] = None
    notes: Optional[str] = None


class PriceAlertResponse(BaseModel):
    """Price alert response with stock info."""
    id: str
    user_id: str
    stock_id: str
    ticker: str
    stock_name: str
    currency: str
    condition_type: Literal['price_above', 'price_below', 'percent_change_day']
    condition_value: float
    is_enabled: bool
    is_triggered: bool
    triggered_at: Optional[datetime] = None
    repeat_after_trigger: bool
    notes: Optional[str] = None
    group_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PriceAlertResetRequest(BaseModel):
    """Request to reset a triggered alert back to active."""
    pass


class PriceAlertTriggerInfo(BaseModel):
    """Info about an alert that was triggered (for notifications)."""
    alert_id: str
    user_id: str
    ticker: str
    stock_name: str
    condition_type: str
    condition_value: float
    current_price: float
    triggered_at: datetime
