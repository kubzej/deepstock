from __future__ import annotations

import base64
import json
import logging
from datetime import date
from typing import Any

from app.core.supabase import supabase

logger = logging.getLogger(__name__)

TIMELINE_EVENT_TYPES = {'daily_briefing', 'earnings', 'option_expiry'}


def _encode_cursor(row: dict[str, Any]) -> str:
    payload = {
        'event_date': row['event_date'],
        'sort_order': row['sort_order'],
        'sort_key': row['sort_key'],
        'id': row['id'],
    }
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(',', ':')).encode())
    return encoded.decode().rstrip('=')


def _decode_cursor(value: str) -> dict[str, Any]:
    try:
        padded = value + '=' * (-len(value) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        if not {
            'event_date',
            'sort_order',
            'sort_key',
            'id',
        }.issubset(payload):
            raise ValueError
        date.fromisoformat(payload['event_date'])
        return payload
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        raise ValueError('Neplatný Timeline cursor.') from None


def _cursor_filter(cursor: dict[str, Any]) -> str:
    event_date = cursor['event_date']
    sort_order = int(cursor['sort_order'])
    sort_key = str(cursor['sort_key'])
    event_id = cursor['id']
    return (
        f'event_date.lt.{event_date},'
        f'and(event_date.eq.{event_date},'
        f'or(sort_order.gt.{sort_order},'
        f'and(sort_order.eq.{sort_order},'
        f'or(sort_key.gt.{sort_key},'
        f'and(sort_key.eq.{sort_key},id.gt.{event_id})))))'
    )


class TimelineService:
    async def list_events(
        self,
        user_id: str,
        *,
        limit: int = 30,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        query = (
            supabase.table('timeline_events')
            .select(
                'id, event_type, event_date, title, subtitle, metadata, '
                'briefing_report_id, created_at, sort_order, sort_key'
            )
            .eq('user_id', user_id)
            .order('event_date', desc=True)
            .order('sort_order', desc=False)
            .order('sort_key', desc=False)
            .order('id', desc=False)
        )

        if cursor:
            query = query.or_(_cursor_filter(_decode_cursor(cursor)))

        response = query.limit(limit + 1).execute()
        rows = response.data or []
        has_more = len(rows) > limit
        events = rows[:limit]

        return {
            'events': events,
            'next_cursor': _encode_cursor(events[-1]) if has_more and events else None,
            'has_more': has_more,
        }

    async def create_event(
        self,
        *,
        user_id: str,
        event_type: str,
        event_date: date,
        source_key: str,
        title: str,
        subtitle: str | None = None,
        metadata: dict[str, Any] | None = None,
        briefing_report_id: str | None = None,
    ) -> dict[str, Any] | None:
        if event_type not in TIMELINE_EVENT_TYPES:
            raise ValueError(f'Neznámý typ Timeline eventu: {event_type}')

        sort_order = {
            'daily_briefing': 10,
            'earnings': 20,
            'option_expiry': 30,
        }[event_type]

        sort_key = str((metadata or {}).get('ticker') or event_type).upper()
        payload: dict[str, Any] = {
            'user_id': user_id,
            'event_type': event_type,
            'event_date': event_date.isoformat(),
            'sort_order': sort_order,
            'sort_key': sort_key,
            'source_key': source_key,
            'title': title,
            'subtitle': subtitle,
            'metadata': metadata or {},
        }
        if briefing_report_id:
            payload['briefing_report_id'] = briefing_report_id

        try:
            response = supabase.table('timeline_events').insert(payload).execute()
        except Exception as exc:
            if 'duplicate key' in str(exc).lower() or 'unique constraint' in str(exc).lower():
                logger.info('Timeline event already exists: %s/%s', event_type, source_key)
                return None
            raise

        return response.data[0] if response.data else None


timeline_service = TimelineService()
