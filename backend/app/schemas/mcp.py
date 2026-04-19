"""
MCP response schemas.

Typed contracts for the DeepStock chat/MCP surface so FastAPI docs and tests
can describe the actual payloads external agents depend on.
"""
from .mcp_activity import *  # noqa: F403
from .mcp_journal import *  # noqa: F403
from .mcp_market import *  # noqa: F403
from .mcp_portfolio import *  # noqa: F403
from .mcp_technical import *  # noqa: F403
from .mcp_ticker import *  # noqa: F403
from .mcp_watchlist import *  # noqa: F403

from .mcp_activity import __all__ as activity_all
from .mcp_journal import __all__ as journal_all
from .mcp_market import __all__ as market_all
from .mcp_portfolio import __all__ as portfolio_all
from .mcp_technical import __all__ as technical_all
from .mcp_ticker import __all__ as ticker_all
from .mcp_watchlist import __all__ as watchlist_all

__all__ = [
    *activity_all,
    *journal_all,
    *market_all,
    *portfolio_all,
    *technical_all,
    *ticker_all,
    *watchlist_all,
]
