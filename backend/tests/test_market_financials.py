from app.services.market.stock_info import _ltm_revenue_growth_from_historical


def test_ltm_revenue_growth_uses_displayed_historical_revenue_series() -> None:
    historical = {
        "years": ["FY 2022", "FY 2023", "FY 2024", "FY 2025", "LTM", "FY 2026E", "5Y Avg"],
        "context": {
            "revenue": [
                59037000,
                75509000,
                187192000,
                501023000,
                757073984,
                2947013620,
                None,
            ],
        },
    }

    assert _ltm_revenue_growth_from_historical(historical) == 0.5111


def test_ltm_revenue_growth_returns_none_when_ltm_or_previous_revenue_is_missing() -> None:
    assert _ltm_revenue_growth_from_historical({"years": ["FY 2025"], "context": {"revenue": [501023000]}}) is None
    assert (
        _ltm_revenue_growth_from_historical(
            {"years": ["FY 2025", "LTM"], "context": {"revenue": [0, 757073984]}}
        )
        is None
    )
