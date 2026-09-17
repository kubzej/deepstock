"""Shared input normalization and additional valuation models.

There is intentionally only one valuation surface and one composite. This
module improves the inputs used by the existing models and contributes normal
standalone models to the same model list.
"""
from __future__ import annotations

from statistics import median
from typing import Any, Optional


CONFIDENCE_WEIGHTS = {"high": 3, "medium": 2, "low": 1}


def _number(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _historical_values(
    historical: Optional[dict],
    group: str,
    key: str,
    *,
    include_ltm: bool = True,
) -> list[float]:
    if not historical:
        return []
    years = historical.get("years") or []
    values = (historical.get(group) or {}).get(key) or []
    result: list[float] = []
    for index, year in enumerate(years):
        if (
            index >= len(values)
            or year == "5Y Avg"
            or year.endswith("E")
            or (not include_ltm and year == "LTM")
        ):
            continue
        value = _number(values[index])
        if value is not None:
            result.append(value)
    return result[-5:]


def _estimate_values(historical: Optional[dict], group: str, key: str) -> list[float]:
    """Return positive forward estimates in the order supplied by the provider."""
    if not historical:
        return []
    years = historical.get("years") or []
    values = (historical.get(group) or {}).get(key) or []
    result: list[float] = []
    for index, year in enumerate(years):
        if index >= len(values) or not year.endswith("E"):
            continue
        value = _number(values[index])
        if value is not None and value > 0:
            result.append(value)
    return result[:2]


def _historical_pairs(
    historical: Optional[dict],
    group: str,
    first_key: str,
    second_key: str,
    *,
    include_ltm: bool = True,
) -> list[tuple[float, float]]:
    """Read two series period-by-period so missing values cannot shift alignment."""
    if not historical:
        return []
    years = historical.get("years") or []
    group_data = historical.get(group) or {}
    first_values = group_data.get(first_key) or []
    second_values = group_data.get(second_key) or []
    result: list[tuple[float, float]] = []
    for index, year in enumerate(years):
        if (
            index >= len(first_values)
            or index >= len(second_values)
            or year == "5Y Avg"
            or year.endswith("E")
            or (not include_ltm and year == "LTM")
        ):
            continue
        first = _number(first_values[index])
        second = _number(second_values[index])
        if first is not None and second is not None:
            result.append((first, second))
    return result[-4:]


def _positive_median(values: list[float]) -> Optional[float]:
    positive = [value for value in values if value > 0]
    return median(positive) if positive else None


def _company_profile(data: dict, historical: Optional[dict]) -> tuple[str, dict]:
    """Classify behavior from revenue history instead of treating a whole sector alike."""
    revenues = _historical_values(
        historical, "context", "revenue", include_ltm=False
    )
    changes = [
        (current / previous) - 1
        for previous, current in zip(revenues, revenues[1:])
        if previous > 0
    ]
    secular_grower = (
        len(changes) >= 2
        and sum(change >= 0 for change in changes) / len(changes) >= 0.75
        and min(changes) >= -0.10
        and revenues[-1] > revenues[0]
    )
    cyclical_sector = (data.get("sector") or "Unknown") in {
        "Energy", "Basic Materials", "Industrials", "Consumer Cyclical",
    }
    profile = "secular_grower" if secular_grower else ("cyclical" if cyclical_sector else "stable")
    return profile, {
        "revenuePeriods": len(revenues),
        "positiveRevenueChanges": sum(change >= 0 for change in changes),
        "revenueChanges": len(changes),
        "maxRevenueDecline": round(min(changes), 4) if changes else None,
    }


def build_valuation_inputs(data: dict, historical: Optional[dict]) -> dict:
    """Create conservative proxies without claiming filing-level adjustments."""
    sector = data.get("sector") or "Unknown"
    current_eps = _number(data.get("eps"))
    shares = _number(data.get("sharesOutstanding"))
    current_fcf = _number(data.get("freeCashflow"))
    current_ebitda = _number(data.get("ebitda"))
    revenue = _number(data.get("revenue"))
    profile, profile_details = _company_profile(data, historical)

    eps_history = _historical_values(
        historical, "context", "eps", include_ltm=False
    )
    eps_candidates = eps_history[-3:]
    if current_eps is not None:
        eps_candidates.append(current_eps)
    eps_median = _positive_median(eps_candidates)
    normalized_eps = current_eps
    eps_notes: list[str] = []
    historical_net_margins = _historical_values(
        historical, "profitability", "net_margin", include_ltm=False
    )
    current_net_margin = _number(data.get("profitMargin"))
    net_margin_candidates = [
        value for value in historical_net_margins[-3:] if 0 < value < 0.60
    ]
    if current_net_margin is not None and 0 < current_net_margin < 0.60:
        net_margin_candidates.append(current_net_margin)
    normalized_net_margin = _positive_median(net_margin_candidates)
    margin_eps = (
        normalized_net_margin * revenue / shares
        if normalized_net_margin
        and revenue and revenue > 0
        and shares and shares > 0
        and len(net_margin_candidates) >= 3
        else None
    )
    if profile == "secular_grower" and margin_eps and margin_eps > 0:
        normalized_eps = margin_eps
        eps_notes.append(
            "Rostoucí firma: EPS odvozeno z mediánu čisté marže a současných tržeb, aby historie netrestala růst velikosti firmy."
        )
    elif current_eps and current_eps > 0 and eps_median:
        ratio = current_eps / eps_median
        if profile == "cyclical" or ratio > 1.8 or ratio < 0.55:
            normalized_eps = eps_median
            eps_notes.append(
                "EPS nahrazen mediánem posledních kladných období kvůli cykličnosti nebo výrazné odchylce."
            )
    elif current_eps is None:
        eps_notes.append("EPS není dostupné; nebylo programaticky domýšleno.")

    fcf_and_shares = _historical_pairs(
        historical,
        "context",
        "free_cashflow",
        "shares",
        include_ltm=False,
    )
    fcf_per_share_history = [
        fcf / period_shares
        for fcf, period_shares in fcf_and_shares
        if fcf > 0 and period_shares > 0
    ]
    current_fcf_per_share = (
        current_fcf / shares if current_fcf and current_fcf > 0 and shares and shares > 0 else None
    )
    fcf_candidates = fcf_per_share_history[-3:]
    if current_fcf_per_share:
        fcf_candidates.append(current_fcf_per_share)
    normalized_fcf_per_share = _positive_median(fcf_candidates)
    fcf_notes: list[str] = []
    historical_fcf_margins = _historical_values(
        historical, "profitability", "fcf_margin", include_ltm=False
    )
    current_fcf_margin = (
        current_fcf / revenue
        if current_fcf and current_fcf > 0 and revenue and revenue > 0
        else None
    )
    fcf_margin_candidates = [
        value for value in historical_fcf_margins[-3:] if 0 < value < 0.50
    ]
    if current_fcf_margin is not None and 0 < current_fcf_margin < 0.50:
        fcf_margin_candidates.append(current_fcf_margin)
    normalized_fcf_margin = _positive_median(fcf_margin_candidates)
    margin_fcf_per_share = (
        normalized_fcf_margin * revenue / shares
        if normalized_fcf_margin
        and revenue and revenue > 0
        and shares and shares > 0
        and len(fcf_margin_candidates) >= 3
        else None
    )
    if profile == "secular_grower" and margin_fcf_per_share and margin_fcf_per_share > 0:
        normalized_fcf_per_share = margin_fcf_per_share
        fcf_notes.append(
            "Rostoucí firma: FCF/akcie odvozeno z mediánu FCF marže a současných tržeb."
        )
    if normalized_fcf_per_share and current_fcf_per_share:
        difference = abs(normalized_fcf_per_share - current_fcf_per_share) / current_fcf_per_share
        if difference > 0.20:
            fcf_notes.append(
                "FCF/akcie vyhlazeno mediánem kladných období; aktuální FCF může být ovlivněno pracovním kapitálem."
            )
    elif current_fcf_per_share is None:
        fcf_notes.append("Aktuální kladné FCF/akcie není dostupné.")

    historical_revenue_growth = _historical_values(
        historical, "growth", "revenue_growth", include_ltm=False
    )
    growth_candidates = [value for value in historical_revenue_growth[-3:] if -0.20 <= value <= 0.60]
    revenue_growth = _number(data.get("revenueGrowth"))
    if revenue_growth is not None and -0.20 <= revenue_growth <= 0.60:
        growth_candidates.append(revenue_growth)
    if current_eps and current_eps > 0:
        forward_eps = _number(data.get("forwardEps"))
        if forward_eps and forward_eps > 0:
            implied_growth = (forward_eps / current_eps) - 1
            growth_candidates.append(min(max(implied_growth, -0.20), 0.50))
    normalized_growth = median(growth_candidates) if growth_candidates else revenue_growth
    if normalized_growth is not None:
        normalized_growth = min(max(normalized_growth, 0.0), 0.30)

    growth_notes: list[str] = []
    raw_earnings_growth = _number(data.get("earningsGrowth"))
    if raw_earnings_growth is not None and normalized_growth is not None:
        if abs(raw_earnings_growth - normalized_growth) > 0.20:
            growth_notes.append(
                "Extrémní jednorázový růst zisku nahrazen mediánem růstu tržeb a forward očekávání."
            )

    forward_eps_estimates = _estimate_values(historical, "context", "eps")
    eps_growth_raw: Optional[float] = None
    eps_growth_periods = 0
    if normalized_eps and normalized_eps > 0 and len(forward_eps_estimates) >= 2:
        eps_growth_raw = (forward_eps_estimates[1] / normalized_eps) ** 0.5 - 1
        eps_growth_periods = 2
    elif normalized_eps and normalized_eps > 0 and forward_eps_estimates:
        eps_growth_raw = (forward_eps_estimates[0] / normalized_eps) - 1
        eps_growth_periods = 1
    elif normalized_eps and normalized_eps > 0:
        forward_eps = _number(data.get("forwardEps"))
        if forward_eps and forward_eps > 0:
            eps_growth_raw = (forward_eps / normalized_eps) - 1
            eps_growth_periods = 1
    normalized_eps_growth = (
        min(max(eps_growth_raw, 0.0), 0.30)
        if eps_growth_raw is not None
        else None
    )
    eps_growth_notes: list[str] = []
    if eps_growth_raw is not None and eps_growth_raw > 0.30:
        eps_growth_notes.append(
            "Očekávaný růst EPS zastropován na 30 %, protože vyšší tempo není pro PEG považováno za dlouhodobě udržitelné."
        )

    ebitda_history = _historical_values(
        historical, "context", "ebitda", include_ltm=False
    )
    ebitda_candidates = ebitda_history[-3:]
    if current_ebitda is not None:
        ebitda_candidates.append(current_ebitda)
    ebitda_median = _positive_median(ebitda_candidates)
    normalized_ebitda = current_ebitda
    ebitda_notes: list[str] = []
    historical_ebitda_margins = _historical_values(
        historical, "profitability", "ebitda_margin", include_ltm=False
    )
    current_ebitda_margin = (
        current_ebitda / revenue
        if current_ebitda and current_ebitda > 0 and revenue and revenue > 0
        else None
    )
    ebitda_margin_candidates = [
        value for value in historical_ebitda_margins[-3:] if 0 < value < 0.80
    ]
    if current_ebitda_margin is not None and 0 < current_ebitda_margin < 0.80:
        ebitda_margin_candidates.append(current_ebitda_margin)
    normalized_ebitda_margin = _positive_median(ebitda_margin_candidates)
    margin_ebitda = (
        normalized_ebitda_margin * revenue
        if normalized_ebitda_margin
        and revenue and revenue > 0
        and len(ebitda_margin_candidates) >= 3
        else None
    )
    if profile == "secular_grower" and margin_ebitda and margin_ebitda > 0:
        normalized_ebitda = margin_ebitda
        ebitda_notes.append(
            "Rostoucí firma: EBITDA odvozena z mediánu EBITDA marže a současných tržeb."
        )
    elif current_ebitda and current_ebitda > 0 and ebitda_median:
        ratio = current_ebitda / ebitda_median
        if profile == "cyclical" or ratio > 1.8 or ratio < 0.55:
            normalized_ebitda = ebitda_median
            ebitda_notes.append(
                "EBITDA nahrazena mediánem kladných období kvůli cykličnosti nebo výrazné odchylce."
            )

    normalization_notes = (
        eps_notes + fcf_notes + growth_notes + eps_growth_notes + ebitda_notes
    )
    return {
        "profile": profile,
        "eps": normalized_eps,
        "fcfPerShare": normalized_fcf_per_share,
        "growth": normalized_growth,
        "epsGrowth": normalized_eps_growth,
        "ebitda": normalized_ebitda,
        "notes": normalization_notes,
        "notesByMetric": {
            "eps": eps_notes,
            "fcfPerShare": fcf_notes,
            "growth": growth_notes,
            "epsGrowth": eps_growth_notes,
            "ebitda": ebitda_notes,
        },
        "details": {
            "eps": {
                "reported": current_eps,
                "normalized": round(normalized_eps, 4) if normalized_eps is not None else None,
                "historicalMedian": round(eps_median, 4) if eps_median is not None else None,
                "normalizedMargin": round(normalized_net_margin, 4) if normalized_net_margin is not None else None,
            },
            "fcfPerShare": {
                "reported": round(current_fcf_per_share, 4) if current_fcf_per_share is not None else None,
                "normalized": round(normalized_fcf_per_share, 4) if normalized_fcf_per_share is not None else None,
                "normalizedMargin": round(normalized_fcf_margin, 4) if normalized_fcf_margin is not None else None,
            },
            "growth": {
                "reportedEarningsGrowth": raw_earnings_growth,
                "reportedRevenueGrowth": revenue_growth,
                "normalized": round(normalized_growth, 4) if normalized_growth is not None else None,
            },
            "epsGrowth": {
                "raw": round(eps_growth_raw, 4) if eps_growth_raw is not None else None,
                "normalized": round(normalized_eps_growth, 4) if normalized_eps_growth is not None else None,
                "periods": eps_growth_periods,
            },
            "ebitda": {
                "reported": current_ebitda,
                "normalized": round(normalized_ebitda, 2) if normalized_ebitda is not None else None,
                "historicalMedian": round(ebitda_median, 2) if ebitda_median is not None else None,
                "normalizedMargin": round(normalized_ebitda_margin, 4) if normalized_ebitda_margin is not None else None,
            },
            "profile": profile_details,
        },
    }


def prepare_valuation_data(data: dict, historical: Optional[dict]) -> tuple[dict, dict]:
    """Return a copy consumed by all models plus an auditable normalization payload."""
    normalized = build_valuation_inputs(data, historical)
    prepared = dict(data)
    if normalized.get("eps") is not None:
        prepared["eps"] = normalized["eps"]
    if normalized.get("fcfPerShare") is not None and prepared.get("sharesOutstanding"):
        prepared["freeCashflow"] = normalized["fcfPerShare"] * prepared["sharesOutstanding"]
    if normalized.get("growth") is not None:
        prepared["earningsGrowth"] = normalized["growth"]
    if normalized.get("ebitda") is not None:
        prepared["ebitda"] = normalized["ebitda"]
    prepared["_valuationNormalization"] = normalized
    return prepared, normalized


def _model(
    *, model_id: str, method: str, description: str, tooltip: str, fair_value: float,
    price: float, inputs: dict, confidence: str, horizon: str,
    horizon_label: str, notes: Optional[list[str]] = None,
) -> dict:
    return {
        "modelId": model_id,
        "method": method,
        "description": description,
        "tooltip": tooltip,
        "fairValue": round(fair_value, 2),
        "upside": round(((fair_value / price) - 1) * 100, 1),
        "inputs": inputs,
        "confidence": confidence,
        "horizon": horizon,
        "horizonLabel": horizon_label,
        "normalizationNotes": notes or [],
    }


def build_historical_models(data: dict, historical: Optional[dict], sector_pe: dict) -> list[dict]:
    """Create standalone historical-multiple methods for the common model list."""
    if not historical:
        return []
    price = _number(data.get("price"))
    shares = _number(data.get("sharesOutstanding"))
    if not price or price <= 0:
        return []
    normalization = data.get("_valuationNormalization") or {}
    notes_by_metric = normalization.get("notesByMetric") or {}
    sector = data.get("sector") or "Unknown"
    models: list[dict] = []

    pe_values = [
        value
        for value in _historical_values(
            historical, "multiples", "pe", include_ltm=False
        )
        if 0 < value < 100
    ]
    eps = _number(normalization.get("eps"))
    if eps and eps > 0 and len(pe_values) >= 3 and sector != "Real Estate":
        historical_pe = median(pe_values)
        benchmark = sector_pe.get(sector, {"low": 15, "mid": 20, "high": 25})
        target_pe = min(max(historical_pe, benchmark["low"]), benchmark["high"])
        confidence = "medium"
        models.append(_model(
            model_id="historical_pe",
            method="Historické P/E",
            description=f"Normalizované EPS {eps:.2f} × medián historického P/E {historical_pe:.1f}×; použitý násobek {target_pe:.1f}×.",
            tooltip="Vlastní historie firmy. Historický medián je omezen sektorovým pásmem, aby jednorázové valuační extrémy neurčovaly výsledek.",
            fair_value=eps * target_pe,
            price=price,
            inputs={"normalizedEps": round(eps, 2), "historicalMedianPE": round(historical_pe, 1), "usedPE": round(target_pe, 1), "observations": len(pe_values)},
            confidence=confidence,
            horizon="medium",
            horizon_label="1-3 roky",
            notes=notes_by_metric.get("eps") or [],
        ))

    pfcf_values = [
        value
        for value in _historical_values(
            historical, "multiples", "pfcf", include_ltm=False
        )
        if 0 < value < 100
    ]
    fcf_per_share = _number(normalization.get("fcfPerShare"))
    if fcf_per_share and fcf_per_share > 0 and len(pfcf_values) >= 3:
        historical_pfcf = median(pfcf_values)
        used_pfcf = min(historical_pfcf, 50.0)
        models.append(_model(
            model_id="historical_pfcf",
            method="Historické P/FCF",
            description=f"Normalizované FCF/akcie {fcf_per_share:.2f} × medián historického P/FCF {historical_pfcf:.1f}×.",
            tooltip="Vyhlazuje jednorázové pohyby pracovního kapitálu přes více období a oceňuje firmu jejím vlastním historickým cash-flow násobkem.",
            fair_value=fcf_per_share * used_pfcf,
            price=price,
            inputs={"normalizedFcfPerShare": round(fcf_per_share, 2), "historicalMedianPfcf": round(historical_pfcf, 1), "usedPfcf": round(used_pfcf, 1), "observations": len(pfcf_values)},
            confidence="medium",
            horizon="medium",
            horizon_label="1-3 roky",
            notes=notes_by_metric.get("fcfPerShare") or [],
        ))

    pb_values = [
        value
        for value in _historical_values(
            historical, "multiples", "pb", include_ltm=False
        )
        if 0 < value < 15
    ]
    book_value = _number(data.get("bookValue"))
    if sector in {"Financial Services", "Real Estate"} and book_value and book_value > 0 and len(pb_values) >= 3:
        historical_pb = median(pb_values)
        models.append(_model(
            model_id="historical_pb",
            method="Historické P/B",
            description=f"Účetní hodnota na akcii {book_value:.2f} × medián vlastního historického P/B {historical_pb:.2f}×.",
            tooltip="Používá vlastní historii firmy místo plošného sektorového P/B. Vhodné hlavně pro banky, pojišťovny a nemovitostní firmy.",
            fair_value=book_value * historical_pb,
            price=price,
            inputs={"bookValuePerShare": round(book_value, 2), "historicalMedianPB": round(historical_pb, 2), "observations": len(pb_values)},
            confidence="medium",
            horizon="long", horizon_label="3-5+ let",
        ))

    ev_ebitda_values = [
        value
        for value in _historical_values(
            historical, "multiples", "ev_ebitda", include_ltm=False
        )
        if 0 < value < 50
    ]
    normalized_ebitda = _number(normalization.get("ebitda"))
    debt = _number(data.get("totalDebt")) or 0
    cash = _number(data.get("totalCash")) or 0
    if (
        sector not in {"Financial Services", "Real Estate"}
        and normalized_ebitda and normalized_ebitda > 0
        and shares and shares > 0
        and len(ev_ebitda_values) >= 3
    ):
        historical_multiple = median(ev_ebitda_values)
        fair_equity = normalized_ebitda * historical_multiple - debt + cash
        if fair_equity > 0:
            models.append(_model(
                model_id="historical_ev_ebitda",
                method="Historické EV/EBITDA",
                description=f"Normalizovaná EBITDA × medián historického EV/EBITDA {historical_multiple:.1f}× − čistý dluh.",
                tooltip="Kapitálově neutrální ocenění založené na vyhlazené EBITDA a vlastní historii firmy.",
                fair_value=fair_equity / shares,
                price=price,
                inputs={"normalizedEbitdaB": round(normalized_ebitda / 1e9, 2), "historicalMedianEvEbitda": round(historical_multiple, 1), "netDebtB": round((debt - cash) / 1e9, 2), "observations": len(ev_ebitda_values)},
                confidence="medium",
                horizon="medium",
                horizon_label="1-3 roky",
                notes=notes_by_metric.get("ebitda") or [],
            ))

    ev_revenue_values = [
        value
        for value in _historical_values(
            historical, "multiples", "ev_revenue", include_ltm=False
        )
        if 0 < value < 30
    ]
    revenue = _number(data.get("revenue"))
    growth = _number(normalization.get("growth")) or 0
    eps_reported = _number(data.get("eps"))
    if (
        len(ev_revenue_values) >= 3 and revenue and revenue > 0 and shares and shares > 0
        and (eps_reported is None or eps_reported <= 0 or growth >= 0.15)
        and sector not in {"Financial Services", "Real Estate"}
    ):
        historical_multiple = median(ev_revenue_values)
        fair_equity = revenue * historical_multiple - debt + cash
        if fair_equity > 0:
            models.append(_model(
                model_id="historical_ev_revenue",
                method="Historické EV/tržby",
                description=f"Tržby × medián historického EV/tržby {historical_multiple:.2f}× − čistý dluh.",
                tooltip="Doplňková metoda pro rychle rostoucí nebo zatím neziskové firmy. Hodnotí celý podnik vůči tržbám a následně odečte čistý dluh.",
                fair_value=fair_equity / shares,
                price=price,
                inputs={"revenueB": round(revenue / 1e9, 2), "historicalMedianEvRevenue": round(historical_multiple, 2), "netDebtB": round((debt - cash) / 1e9, 2), "observations": len(ev_revenue_values)},
                confidence="medium",
                horizon="medium", horizon_label="1-3 roky",
            ))
    return models


def calculate_robust_composite(models: list[dict], price: float) -> Optional[dict]:
    """Confidence-weighted composite with two bounded outlier passes."""
    valid = [model for model in models if _number(model.get("fairValue")) and model["fairValue"] > 0]
    if not valid:
        return None
    included = list(valid)
    if len(valid) >= 4:
        for _ in range(2):
            center = median(float(model["fairValue"]) for model in included)
            filtered = [
                model
                for model in included
                if center * 0.5 <= float(model["fairValue"]) <= center * 2.0
            ]
            if len(filtered) < 3 or len(filtered) == len(included):
                break
            included = filtered

    included_ids = {id(model) for model in included}
    for model in valid:
        model["includedInComposite"] = id(model) in included_ids
        if model["includedInComposite"]:
            model.pop("compositeExclusionReason", None)
        else:
            model["compositeExclusionReason"] = (
                "Výsledek zůstal po dvou kontrolních kolech mimo 0,5–2,0× mediánu platných metod; je viditelný, ale neovlivňuje kompozit."
            )

    total_weight = 0
    weighted_sum = 0.0
    has_historical_ev = any(
        model.get("modelId") == "historical_ev_ebitda" for model in included
    )
    for model in included:
        weight = CONFIDENCE_WEIGHTS.get(model.get("confidence", "low"), 1)
        if model.get("modelId") == "analyst_consensus":
            weight = min(weight, 2)
            model["compositeWeightReason"] = "Analytický konsenzus je kontrolní pohled; váha je nejvýše 2×."
        elif model.get("modelId") == "sector_ev_ebitda" and has_historical_ev:
            weight = min(weight, 1)
            model["compositeWeightReason"] = "Sektorové EV/EBITDA má váhu 1×, protože historická EV/EBITDA metoda používá stejný ziskový základ."
        model["compositeWeight"] = weight
        weighted_sum += float(model["fairValue"]) * weight
        total_weight += weight
    fair_value = weighted_sum / total_weight
    upside = ((fair_value / price) - 1) * 100
    if upside > 20:
        signal = "undervalued"
    elif upside > 5:
        signal = "slightly_undervalued"
    elif upside < -20:
        signal = "overvalued"
    elif upside < -5:
        signal = "slightly_overvalued"
    else:
        signal = "fair"
    return {
        "fairValue": round(fair_value, 2), "upside": round(upside, 1), "signal": signal,
        "modelsUsed": len(included), "modelsAvailable": len(valid),
        "formula": "Σ (férová hodnota × váha confidence) / Σ vah", "totalWeight": total_weight,
    }
