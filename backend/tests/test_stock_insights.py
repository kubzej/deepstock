from app.services.market.stock_info import generate_insights


def _titles(insights: list[dict]) -> set[str]:
    return {item["title"] for item in insights}


def test_loss_making_operator_with_one_off_net_income_does_not_get_profitability_positives() -> None:
    insights = generate_insights(
        {
            "sector": "Technology",
            "currentRatio": 10.911,
            "quickRatio": 10.281,
            "debtToEquity": 1.542,
            "revenueGrowth": 10.799,
            "grossMargin": 0.44849,
            "operatingMargin": -0.85134006,
            "profitMargin": 2.5192,
            "eps": 0.09,
            "forwardEps": -0.03,
            "roe": 0.42948002,
            "roa": -0.04247,
            "trailingPE": 73.888885,
            "forwardPE": -221.66667,
            "freeCashflow": -15650777,
            "priceToSales": 39.22599,
        }
    )

    titles = _titles(insights)

    assert "Očekávaný růst zisků" not in titles
    assert "Vynikající čistá marže" not in titles
    assert "Silná návratnost kapitálu" not in titles
    assert "Očekávaný pokles EPS" in titles
    assert "Záporný cash flow" in titles


def test_positive_forward_pe_and_operating_quality_can_still_trigger_profitability_positives() -> None:
    insights = generate_insights(
        {
            "sector": "Technology",
            "currentRatio": 2.5,
            "quickRatio": 1.8,
            "debtToEquity": 10,
            "revenueGrowth": 0.30,
            "grossMargin": 0.65,
            "operatingMargin": 0.32,
            "profitMargin": 0.28,
            "eps": 2.0,
            "forwardEps": 3.0,
            "roe": 0.25,
            "roa": 0.12,
            "trailingPE": 30.0,
            "forwardPE": 20.0,
            "freeCashflow": 100000000,
        }
    )

    titles = _titles(insights)

    assert "Očekávaný růst zisků" in titles
    assert "Vynikající čistá marže" in titles
    assert "Silná návratnost kapitálu" in titles


def test_ltm_negative_fcf_suppresses_consistent_fcf_positive() -> None:
    insights = generate_insights(
        {
            "sector": "Energy",
            "freeCashflow": -10875000,
        },
        historical={
            "years": ["FY 2022", "FY 2023", "FY 2024", "FY 2025", "LTM", "5Y Avg"],
            "context": {
                "free_cashflow": [
                    19900000,
                    7500000,
                    32900000,
                    31300000,
                    -10875000,
                    None,
                ],
            },
        },
    )

    titles = _titles(insights)

    assert "Konzistentní FCF" not in titles
    assert "Historicky pozitivní FCF, LTM záporný" in titles
    assert "Záporný cash flow" in titles
