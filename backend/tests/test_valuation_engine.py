import pytest

from app.services.market.valuation_engine import (
    build_historical_models,
    build_valuation_inputs,
    calculate_robust_composite,
    prepare_valuation_data,
)
from app.services.market.stock_info import calculate_valuation


def _historical():
    return {
        "years": ["FY 2022", "FY 2023", "FY 2024", "LTM", "FY 2026E", "5Y Avg"],
        "multiples": {
            "pe": [18, 22, 20, 24, 21, 21],
            "pb": [2, 2.1, 2.2, 2.3, None, 2.15],
            "pfcf": [16, 18, 20, 22, None, 19],
            "ev_ebitda": [10, 12, 11, 13, None, 11.5],
            "ev_revenue": [3, 3.2, 3.1, 3.3, 2.8, 3.15],
        },
        "growth": {
            "revenue_growth": [0.08, 0.10, 0.12, 0.11, None, 0.10],
        },
        "context": {
            "eps": [4.0, 4.5, 5.0, 12.0, 6.0, None],
            "net_income": [100, 110, 120, 300, None, None],
            "free_cashflow": [80, 100, 120, 400, None, None],
            "shares": [10, 10, 10, 10, 10, None],
            "ebitda": [150, 160, 170, 500, None, None],
        },
    }


def test_normalization_replaces_extreme_cyclical_eps_and_smooths_fcf():
    data = {
        "sector": "Industrials",
        "eps": 12.0,
        "forwardEps": 6.0,
        "freeCashflow": 400,
        "sharesOutstanding": 10,
        "revenueGrowth": 0.11,
        "earningsGrowth": 1.5,
    }

    normalized = build_valuation_inputs(data, _historical())

    assert normalized["eps"] == 4.75
    assert normalized["fcfPerShare"] == 11.0
    assert normalized["growth"] == 0.1
    assert len(normalized["notes"]) >= 2


def test_prepare_data_makes_existing_models_use_normalized_inputs():
    data = {
        "sector": "Industrials",
        "eps": 12.0,
        "forwardEps": 6.0,
        "freeCashflow": 400,
        "sharesOutstanding": 10,
        "revenueGrowth": 0.11,
        "earningsGrowth": 1.5,
    }

    prepared, normalized = prepare_valuation_data(data, _historical())

    assert prepared["eps"] == normalized["eps"]
    assert prepared["freeCashflow"] == normalized["fcfPerShare"] * 10
    assert prepared["earningsGrowth"] == normalized["growth"]


def test_growth_models_require_shared_normalized_growth():
    valuation = calculate_valuation(
        {
            "sector": "Industrials",
            "price": 100,
            "eps": 5.0,
            "freeCashflow": 100,
            "sharesOutstanding": 10,
            "earningsGrowth": 1.5,
            "beta": 1.0,
            "dividendRate": 1.0,
            "payoutRatio": 0.4,
        },
        historical=None,
    )

    methods = {model["method"] for model in valuation["models"]}
    assert "Grahamovy formule" not in methods
    assert "DCF (Diskontované CF)" not in methods
    assert "PEG Model" not in methods
    assert "Forward PEG (růstový)" not in methods
    assert "Dividendový model" not in methods


def test_secular_grower_uses_current_scale_and_forward_eps_cagr():
    historical = {
        "years": [
            "FY 2021", "FY 2022", "FY 2023", "FY 2024", "LTM",
            "FY 2026E", "FY 2027E", "5Y Avg",
        ],
        "context": {
            "revenue": [470, 514, 575, 638, 700, 760, 830, None],
            "eps": [2.0, 2.8, 4.6, 6.0, 6.35, 8.0, 10.0, None],
            "free_cashflow": [20, 25, 30, 35, 40, None, None, None],
            "shares": [10, 10, 10, 10, 10, 10, 10, None],
            "ebitda": [60, 72, 95, 125, 140, None, None, None],
        },
        "profitability": {
            "net_margin": [0.04, 0.05, 0.08, 0.10, 0.11, None, None, None],
            "ebitda_margin": [0.12, 0.14, 0.18, 0.20, 0.20, None, None, None],
        },
        "growth": {
            "revenue_growth": [None, 0.09, 0.12, 0.11, 0.10, None, None, None],
        },
    }
    data = {
        "sector": "Consumer Cyclical",
        "revenue": 700,
        "profitMargin": 0.11,
        "eps": 6.35,
        "forwardEps": 8.0,
        "freeCashflow": 40,
        "sharesOutstanding": 10,
        "ebitda": 140,
        "revenueGrowth": 0.10,
        "earningsGrowth": 0.50,
    }

    normalized = build_valuation_inputs(data, historical)

    assert normalized["profile"] == "secular_grower"
    assert normalized["eps"] == 6.3
    assert normalized["ebitda"] == 133.0
    assert normalized["epsGrowth"] == pytest.approx(0.2599, abs=0.0001)
    assert "marže" in " ".join(normalized["notes"])


def test_existing_methods_use_cleaned_inputs_in_the_same_model_list():
    data = {
        "sector": "Industrials",
        "price": 100,
        "eps": 12.0,
        "forwardEps": 6.0,
        "freeCashflow": 400,
        "sharesOutstanding": 10,
        "ebitda": 500,
        "enterpriseValue": 1_000,
        "enterpriseToEbitda": 2.0,
        "totalDebt": 100,
        "totalCash": 20,
        "revenueGrowth": 0.11,
        "earningsGrowth": 1.5,
        "beta": 1.0,
    }

    valuation = calculate_valuation(data, historical=_historical())
    models = {model["method"]: model for model in valuation["models"]}

    assert models["DCF (Diskontované CF)"]["inputs"]["fcfPerShare"] == 11.0
    assert models["Výnosová síla (EPV)"]["inputs"]["normalizedEps"] == 4.75
    assert models["P/E sektorový"]["inputs"]["eps"] == 4.75
    assert models["EV/EBITDA"]["inputs"]["normalizedEbitdaB"] == 0.0
    assert valuation["composite"] is not None
    assert "contextual" not in valuation


def test_historical_methods_are_regular_models():
    data = {
        "sector": "Technology",
        "price": 100,
        "eps": 5,
        "freeCashflow": 120,
        "sharesOutstanding": 10,
        "ebitda": 170,
        "totalDebt": 100,
        "totalCash": 20,
        "revenue": 500,
        "revenueGrowth": 0.11,
        "earningsGrowth": 0.1,
    }
    prepared, _ = prepare_valuation_data(data, _historical())

    models = build_historical_models(
        prepared,
        _historical(),
        {"Technology": {"low": 20, "mid": 28, "high": 35}},
    )

    methods = {model["method"] for model in models}
    assert "Historické P/E" in methods
    assert "Historické P/FCF" in methods
    assert "Historické EV/EBITDA" in methods
    assert all("inputs" in model and "fairValue" in model for model in models)


def test_composite_keeps_outlier_visible_but_does_not_count_it():
    models = [
        {"method": "A", "fairValue": 95, "confidence": "medium"},
        {"method": "B", "fairValue": 100, "confidence": "high"},
        {"method": "C", "fairValue": 110, "confidence": "medium"},
        {"method": "Extreme", "fairValue": 500, "confidence": "low"},
    ]

    composite = calculate_robust_composite(models, 100)

    assert composite["modelsUsed"] == 3
    assert composite["modelsAvailable"] == 4
    assert models[-1]["includedInComposite"] is False
    assert "mediánu" in models[-1]["compositeExclusionReason"]


def test_composite_rechecks_center_and_caps_analyst_weight():
    values = [24, 69, 94, 150, 176, 222, 241, 265, 328]
    models = [
        {"method": f"Model {index}", "fairValue": value, "confidence": "medium"}
        for index, value in enumerate(values)
    ]
    models[-1]["modelId"] = "analyst_consensus"
    models[-1]["method"] = "Analytici (konsenzus)"
    models[-1]["confidence"] = "high"

    composite = calculate_robust_composite(models, 200)

    assert models[2]["includedInComposite"] is False
    assert models[-1]["includedInComposite"] is True
    assert models[-1]["compositeWeight"] == 2
    assert composite["modelsUsed"] == 6
