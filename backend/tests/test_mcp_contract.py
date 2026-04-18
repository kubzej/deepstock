from app.schemas.mcp import (
    GlobalMarketContextResponse,
    InvestmentActivityResponse,
    NoteContentResponse,
    PortfolioContextResponse,
    PortfolioListResponse,
    PortfolioPerformanceResponse,
    ReportContentResponse,
    ResearchArchiveResponse,
    SavePortfolioJournalNoteRequest,
    SavePortfolioJournalNoteResponse,
    SaveStockJournalNoteRequest,
    SaveStockJournalNoteResponse,
    StockContextResponse,
    TechnicalHistoryResponse,
)


def test_stock_context_contract_accepts_summary_shape():
    payload = {
        "ticker": "NVDA",
        "generated_at": "2026-04-17T10:00:00Z",
        "ticker_info": {
            "symbol": "NVDA",
            "name": "NVIDIA Corporation",
            "currency": "USD",
        },
        "journal_context": {
            "note_count": 2,
            "report_count": 1,
            "latest_note_at": "2026-04-16T10:00:00Z",
            "latest_report_at": "2026-04-15T10:00:00Z",
            "has_more_notes": False,
            "has_more_reports": False,
            "notes": [
                {
                    "id": "note-1",
                    "created_at": "2026-04-16T10:00:00Z",
                    "updated_at": None,
                    "type": "note",
                    "preview": "Pulled back into support.",
                    "metadata": {"price_at_creation": 110.0},
                }
            ],
            "reports": [
                {
                    "id": "report-1",
                    "created_at": "2026-04-15T10:00:00Z",
                    "report_type": "full_analysis",
                    "model": "claude-sonnet",
                    "preview": "Data center growth remains strong.",
                    "content_length": 4200,
                }
            ],
        },
        "activity_context": {
            "position_summary": {
                "has_position": True,
                "shares": 10,
                "total_cost": 1000,
                "market_value": 1150,
                "unrealized_pnl": 150,
                "currency": "USD",
            },
            "stock_transaction_count": 3,
            "latest_stock_transaction_at": "2026-04-10T10:00:00Z",
            "has_more_stock_transactions": False,
            "option_summary": {
                "has_option_activity": True,
                "open_positions": 1,
                "contracts": 1,
                "open_holdings": [],
            },
            "option_transaction_count": 2,
            "latest_option_transaction_at": "2026-04-11T10:00:00Z",
            "has_more_option_transactions": False,
        },
        "watchlist_context": {
            "count": 1,
            "items": [],
        },
        "market_context": {
            "fundamentals": {"price": 115.0, "market_cap": 1000000},
            "historical_financials": {"years": []},
            "valuation": {"composite": {"signal": "fair"}},
            "smart_analysis": {
                "verdict": "watch",
                "valuation_signal": "fair",
                "valuation_label": {"text": "Férová cena", "tone": "neutral"},
                "technical_note": "Ve středu pásma.",
                "positives": [],
                "warnings": [],
                "infos": [],
            },
            "technicals": {
                "summary": {
                    "trend_signal": "neutral",
                    "trend_description": "Sideways",
                    "rsi14": 54.2,
                    "rsi_signal": "neutral",
                    "macd_trend": "flat",
                    "price_vs_sma50": 1.1,
                    "price_vs_sma200": 8.4,
                    "bollinger_signal": "neutral",
                    "volume_signal": "normal",
                }
            },
        },
    }

    model = StockContextResponse.model_validate(payload)
    assert model.ticker == "NVDA"
    assert model.journal_context.note_count == 2
    assert model.activity_context.position_summary.has_position is True


def test_detail_contracts_accept_full_content_payloads():
    archive = ResearchArchiveResponse.model_validate(
        {
            "ticker": "NVDA",
            "generated_at": "2026-04-17T10:00:00Z",
            "reports": [
                {
                    "id": "report-1",
                    "created_at": "2026-04-15T10:00:00Z",
                    "report_type": "full_analysis",
                    "model": "claude-sonnet",
                    "preview": "Preview",
                    "content_length": 3200,
                }
            ],
            "notes": [
                {
                    "id": "note-1",
                    "created_at": "2026-04-14T10:00:00Z",
                    "updated_at": None,
                    "type": "note",
                    "preview": "Preview",
                    "metadata": {},
                }
            ],
        }
    )
    report = ReportContentResponse.model_validate(
        {
            "id": "report-1",
            "created_at": "2026-04-15T10:00:00Z",
            "report_type": "full_analysis",
            "model": "claude-sonnet",
            "content": "# Full markdown",
            "content_format": "markdown",
        }
    )
    note = NoteContentResponse.model_validate(
        {
            "id": "note-1",
            "created_at": "2026-04-14T10:00:00Z",
            "updated_at": None,
            "type": "note",
            "content": "Full note",
            "content_format": "plain_text",
            "metadata": {"price_at_creation": 100.0},
        }
    )
    technical = TechnicalHistoryResponse.model_validate(
        {
            "ticker": "NVDA",
            "generated_at": "2026-04-17T10:00:00Z",
            "period": "6mo",
            "summary": {
                "trend_signal": "bullish",
                "trend_description": "Uptrend",
                "rsi14": 62.1,
                "rsi_signal": "neutral",
                "macd_trend": "bullish",
                "bollinger_signal": "neutral",
                "volume_signal": "normal",
            },
            "history": {
                "period": "6mo",
                "price": [
                    {
                        "date": "2026-04-01T00:00:00",
                        "price": 115.0,
                        "sma50": 110.0,
                        "sma200": 98.5,
                    }
                ],
                "rsi": [
                    {
                        "date": "2026-04-01T00:00:00",
                        "rsi": 62.1,
                    }
                ],
                "macd": [
                    {
                        "date": "2026-04-01T00:00:00",
                        "macd": 1.2,
                        "signal": 0.8,
                        "histogram": 0.4,
                    }
                ],
            },
        }
    )
    activity = InvestmentActivityResponse.model_validate(
        {
            "ticker": "NVDA",
            "generated_at": "2026-04-17T10:00:00Z",
            "position_summary": {
                "has_position": True,
                "shares": 10,
                "total_cost": 1000,
                "market_value": 1150,
                "unrealized_pnl": 150,
                "currency": "USD",
            },
            "stock_transactions": [],
            "option_summary": {
                "has_option_activity": False,
                "open_positions": 0,
                "contracts": 0,
                "open_holdings": [],
            },
            "option_transactions": [],
        }
    )

    assert archive.reports[0].id == "report-1"
    assert report.content.startswith("# Full")
    assert report.content_format == "markdown"
    assert note.type == "note"
    assert note.content_format == "plain_text"
    assert technical.period == "6mo"
    assert activity.position_summary.currency == "USD"


def test_save_stock_journal_note_contract_accepts_writeback_shape():
    request = SaveStockJournalNoteRequest.model_validate(
        {
            "ticker": " nvda ",
            "content": "Conviction is improving after the recent pullback.\n\nKeep watching margins.",
        }
    )
    response = SaveStockJournalNoteResponse.model_validate(
        {
            "entry_id": "note-1",
            "ticker": "NVDA",
            "channel_id": "channel-1",
            "created_at": "2026-04-17T10:00:00Z",
            "content": "Conviction is improving after the recent pullback.\n\nKeep watching margins.",
            "content_format": "plain_text",
            "metadata": {
                "ticker": "NVDA",
                "source": "mcp_stock_note",
                "price_at_creation": 110.0,
            },
        }
    )

    assert request.ticker == "NVDA"
    assert request.content.startswith("Conviction")
    assert response.content_format == "plain_text"
    assert response.metadata["source"] == "mcp_stock_note"


def test_save_portfolio_journal_note_contract_accepts_writeback_shape():
    request = SavePortfolioJournalNoteRequest.model_validate(
        {
            "portfolio_id": " portfolio-main ",
            "content": "Portfolio is still too concentrated in semis.\n\nNext adds should improve diversification.",
        }
    )
    response = SavePortfolioJournalNoteResponse.model_validate(
        {
            "entry_id": "note-2",
            "portfolio_id": "portfolio-main",
            "portfolio_name": "Main",
            "channel_id": "channel-2",
            "created_at": "2026-04-17T10:00:00Z",
            "content": "Portfolio is still too concentrated in semis.\n\nNext adds should improve diversification.",
            "content_format": "plain_text",
            "metadata": {
                "portfolio_id": "portfolio-main",
                "portfolio_name": "Main",
                "source": "mcp_portfolio_note",
            },
        }
    )

    assert request.portfolio_id == "portfolio-main"
    assert request.content.startswith("Portfolio")
    assert response.content_format == "plain_text"
    assert response.metadata["source"] == "mcp_portfolio_note"


def test_portfolio_and_market_contracts_accept_expected_shapes():
    portfolios = PortfolioListResponse.model_validate(
        {
            "generated_at": "2026-04-17T10:00:00Z",
            "portfolio_count": 2,
            "portfolios": [
                {
                    "id": "p-main",
                    "name": "Main",
                    "description": None,
                    "snapshot": {
                        "total_value_czk": 100000,
                        "total_cost_czk": 90000,
                        "total_pnl_czk": 10000,
                        "total_pnl_percent": 11.11,
                        "daily_change_czk": 500,
                        "daily_change_percent": 0.5,
                    },
                }
            ],
        }
    )
    context = PortfolioContextResponse.model_validate(
        {
            "scope": "all",
            "generated_at": "2026-04-17T10:00:00Z",
            "portfolio_count": 2,
            "portfolios": [
                {
                    "id": "p-main",
                    "name": "Main",
                    "description": None,
                    "snapshot": {
                        "total_value_czk": 100000,
                        "total_cost_czk": 90000,
                        "total_pnl_czk": 10000,
                        "total_pnl_percent": 11.11,
                        "daily_change_czk": 500,
                        "daily_change_percent": 0.5,
                    },
                }
            ],
            "aggregate_snapshot": {
                "total_value_czk": 150000,
                "total_cost_czk": 130000,
                "total_pnl_czk": 20000,
                "total_pnl_percent": 15.38,
                "daily_change_czk": 900,
                "daily_change_percent": 0.6,
            },
            "holdings": [
                {
                    "portfolio_id": "p-main",
                    "portfolio_name": "Main",
                    "ticker": "NVDA",
                    "name": "NVIDIA Corporation",
                    "shares": 10,
                    "avg_cost": 100,
                    "currency": "USD",
                    "sector": "Technology",
                    "total_invested_czk": 23000,
                    "current_price": 110,
                    "current_value_czk": 25300,
                    "unrealized_pnl_czk": 2300,
                    "unrealized_pnl_pct": 10.0,
                }
            ],
            "sector_exposure": [
                {"sector": "Technology", "value_czk": 25300, "weight_pct": 100}
            ],
            "recent_transactions": [],
            "open_lots_summary": {"count": 2, "tickers": ["NVDA", "MSFT"]},
        }
    )
    performance = PortfolioPerformanceResponse.model_validate(
        {
            "scope": "all",
            "generated_at": "2026-04-17T10:00:00Z",
            "period": "1Y",
            "stock_performance": {
                "total_return": 12345.67,
                "total_return_pct": 14.2,
                "benchmark_return_pct": None,
                "data": [{"date": "2026-01-01", "value": 100000, "invested": 90000, "benchmark": None}],
            },
            "options_performance": {
                "total_return": 4500,
                "total_return_pct": 0,
                "benchmark_return_pct": None,
                "data": [{"date": "2026-01-01", "value": 4500, "invested": 0, "benchmark": None}],
            },
        }
    )
    market = GlobalMarketContextResponse.model_validate(
        {
            "generated_at": "2026-04-17T10:00:00Z",
            "sentiment": {
                "score": 68.2,
                "rating": "Greed",
                "previous_close": 64.1,
                "previous_week": 58.0,
                "previous_month": 47.5,
                "previous_year": 71.2,
            },
            "fx": {"rates_to_czk": {"USD": 23.45, "EUR": 25.1, "GBP": 29.8, "CZK": 1.0}},
            "macro_quotes": [
                {
                    "ticker": "GLD",
                    "name": "Zlato",
                    "description": "Safe haven.",
                    "inverted": False,
                    "price": 210.2,
                    "change_percent": 0.5,
                    "volume": 1000,
                    "avg_volume": 900,
                    "last_updated": "2026-04-17T10:00:00Z",
                }
            ],
        }
    )

    assert portfolios.portfolio_count == 2
    assert context.scope == "all"
    assert performance.period == "1Y"
    assert market.macro_quotes[0].ticker == "GLD"
