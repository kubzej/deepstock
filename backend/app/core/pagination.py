"""Keyset pagination cursors for lists ordered newest-first by a timestamp.

Many rows can share one timestamp (the UI records only a date), so the cursor carries
the row id as a tie-breaker. Pages must be ordered by (sort column desc, id desc).
"""
import uuid
from datetime import datetime

_SEPARATOR = "|"


def encode_cursor(sort_value: str, row_id: str) -> str:
    return f"{sort_value}{_SEPARATOR}{row_id}"


def decode_cursor(cursor: str) -> tuple[str, str]:
    """Return (sort_value, row_id) of a cursor, or raise ValueError if it is not one we issued."""
    sort_value, separator, row_id = cursor.rpartition(_SEPARATOR)
    if not separator:
        raise ValueError("Neplatný kurzor stránkování")
    try:
        datetime.fromisoformat(sort_value)
        uuid.UUID(row_id)
    except ValueError:
        raise ValueError("Neplatný kurzor stránkování") from None
    return sort_value, row_id


def older_than_filter(column: str, cursor: str) -> str:
    """PostgREST `or` filter selecting the rows that come after `cursor` in (column desc, id desc) order."""
    sort_value, row_id = decode_cursor(cursor)
    return f'{column}.lt."{sort_value}",and({column}.eq."{sort_value}",id.lt."{row_id}")'
