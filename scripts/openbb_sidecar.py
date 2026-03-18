#!/usr/bin/env python3
from __future__ import annotations

import math
import os
from time import monotonic
from datetime import UTC, date, datetime
from typing import Any

import certifi
import uvicorn
from fastapi import FastAPI, HTTPException, Request

from openbb_core.app.command_runner import CommandRunner

CERT_BUNDLE = certifi.where()
for env_key in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
    os.environ[env_key] = CERT_BUNDLE

app = FastAPI(title="Pulse OpenBB Sidecar", version="0.1.0")
runner = CommandRunner()
DATASET_CACHE_TTLS: dict[str, int] = {
    "macro.fred-series": 15 * 60,
    "macro.money-measures": 60 * 60,
    "macro.unemployment": 24 * 60 * 60,
    "energy.short-term-energy-outlook": 24 * 60 * 60,
    "energy.petroleum-status-report": 6 * 60 * 60,
    "filings.sec-form-13f": 24 * 60 * 60,
    "macro.risk-premium": 24 * 60 * 60,
}
DATASET_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
CATALOG_CACHE_TTL_SECONDS = 6 * 60 * 60
CATALOG_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return {str(key): json_value(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [json_value(item) for item in value]
    return str(value)


def result_to_row(item: Any) -> dict[str, Any]:
    if hasattr(item, "model_dump"):
        payload = item.model_dump(mode="json")
    elif isinstance(item, dict):
        payload = item
    else:
        payload = {"value": item}

    return {str(key): json_value(value) for key, value in payload.items()}


def titleize(key: str) -> str:
    if key.upper() == key and any(char.isalpha() for char in key):
        return key
    return key.replace("_", " ").replace("-", " ").title()


def looks_like_date_key(key: str) -> bool:
    lowered = key.lower()
    return lowered in {"date", "month", "period", "period_ending"} or lowered.endswith("_date")


def field_format(values: list[Any]) -> str:
    numeric = [value for value in values if isinstance(value, (int, float)) and not isinstance(value, bool)]
    if not numeric:
        return "string"

    if all(isinstance(value, int) for value in numeric):
        return "integer"

    return "number"


def unique_sample_values(values: list[Any], limit: int = 8) -> tuple[int, list[Any]]:
    unique_count = 0
    samples: list[Any] = []
    seen: set[str] = set()

    for value in values:
        if value is None:
            continue

        marker = f"{type(value).__name__}:{value}"
        if marker in seen:
            continue

        seen.add(marker)
        unique_count += 1
        if len(samples) < limit:
            samples.append(value)

    return unique_count, samples


def infer_dataset_metadata(
    rows: list[dict[str, Any]],
    preferred_date_field: str | None = None,
    field_overrides: dict[str, dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], str | None, list[str], list[str]]:
    field_overrides = field_overrides or {}
    ordered_keys: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in ordered_keys:
                ordered_keys.append(key)

    if preferred_date_field and preferred_date_field in ordered_keys:
        date_field = preferred_date_field
    else:
        date_field = next((key for key in ordered_keys if looks_like_date_key(key)), None)

    metric_fields: list[str] = []
    dimension_fields: list[str] = []
    fields: list[dict[str, Any]] = []

    for key in ordered_keys:
        values = [row.get(key) for row in rows]
        non_null_values = [value for value in values if value is not None]
        numeric_values = [
            value
            for value in non_null_values
            if isinstance(value, (int, float)) and not isinstance(value, bool)
        ]
        override = field_overrides.get(key, {})
        role = "dimension"
        if key == date_field:
            role = "date"
        elif numeric_values:
            role = "metric"
        role = override.get("role", role)

        if role == "metric":
            metric_fields.append(key)
        elif role == "dimension":
            dimension_fields.append(key)

        unique_value_count, sample_values = unique_sample_values(non_null_values)
        fields.append(
            {
                "key": key,
                "label": override.get("label", titleize(key)),
                "role": role,
                "format": override.get("format", field_format(non_null_values)),
                "unit": override.get("unit"),
                "nullable": len(non_null_values) < len(values),
                "nonNullCount": len(non_null_values),
                "uniqueValueCount": unique_value_count,
                "sampleValues": [json_value(value) for value in sample_values],
            }
        )

    return fields, date_field, dimension_fields, metric_fields


def dataset_payload(
    *,
    key: str,
    kind: str,
    title: str,
    providers: list[str],
    route: str,
    rows: list[dict[str, Any]],
    preferred_date_field: str | None = None,
    view: dict[str, Any] | None = None,
    field_overrides: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    fields, date_field, dimension_fields, metric_fields = infer_dataset_metadata(
        rows,
        preferred_date_field=preferred_date_field,
        field_overrides=field_overrides,
    )

    return {
        "version": "v1",
        "key": key,
        "kind": kind,
        "title": title,
        "source": {
            "adapter": "openbb-command-runner",
            "providers": providers,
            "route": route,
            "asOf": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        },
        "fields": fields,
        "dateField": date_field,
        "dimensionFields": dimension_fields,
        "metricFields": metric_fields,
        "view": view or {},
        "rows": rows,
    }


def build_cache_key(dataset_key: str, params: dict[str, str]) -> str:
    bits = [dataset_key]
    for key, value in sorted(params.items()):
        bits.append(f"{key}={value}")
    return "::".join(bits)


def prune_dataset_cache() -> None:
    now = monotonic()
    expired_keys = [
        cache_key
        for cache_key, (expires_at, _) in DATASET_CACHE.items()
        if expires_at <= now
    ]
    for cache_key in expired_keys:
        DATASET_CACHE.pop(cache_key, None)

    expired_catalog_keys = [
        cache_key
        for cache_key, (expires_at, _) in CATALOG_CACHE.items()
        if expires_at <= now
    ]
    for cache_key in expired_catalog_keys:
        CATALOG_CACHE.pop(cache_key, None)


def read_cached_dataset(dataset_key: str, params: dict[str, str]) -> dict[str, Any] | None:
    cache_key = build_cache_key(dataset_key, params)
    cached = DATASET_CACHE.get(cache_key)
    if cached is None:
        return None

    expires_at, payload = cached
    if expires_at <= monotonic():
        DATASET_CACHE.pop(cache_key, None)
        return None

    return payload


def write_cached_dataset(dataset_key: str, params: dict[str, str], payload: dict[str, Any]) -> None:
    ttl_seconds = DATASET_CACHE_TTLS.get(dataset_key)
    if not ttl_seconds or ttl_seconds <= 0:
        return

    cache_key = build_cache_key(dataset_key, params)
    DATASET_CACHE[cache_key] = (monotonic() + ttl_seconds, payload)


def read_cached_catalog(catalog_key: str, params: dict[str, str]) -> dict[str, Any] | None:
    cache_key = build_cache_key(f"catalog:{catalog_key}", params)
    cached = CATALOG_CACHE.get(cache_key)
    if cached is None:
        return None

    expires_at, payload = cached
    if expires_at <= monotonic():
        CATALOG_CACHE.pop(cache_key, None)
        return None

    return payload


def write_cached_catalog(catalog_key: str, params: dict[str, str], payload: dict[str, Any]) -> None:
    cache_key = build_cache_key(f"catalog:{catalog_key}", params)
    CATALOG_CACHE[cache_key] = (monotonic() + CATALOG_CACHE_TTL_SECONDS, payload)


async def run_openbb_command(
    command: str,
    provider: str,
    standard_params: dict[str, Any],
    extra_params: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    result = await runner.run(
        command,
        provider_choices={"provider": provider},
        standard_params=standard_params,
        extra_params=extra_params or {},
    )
    return [result_to_row(item) for item in result.results]


def filter_rows_by_exact(rows: list[dict[str, Any]], field: str, value: str | None) -> list[dict[str, Any]]:
    if not value:
        return rows

    expected = value.strip().lower()
    if not expected:
        return rows

    return [row for row in rows if str(row.get(field, "")).strip().lower() == expected]


def filter_rows_by_contains(
    rows: list[dict[str, Any]], field: str, value: str | None
) -> list[dict[str, Any]]:
    if not value:
        return rows

    expected = value.strip().lower()
    if not expected:
        return rows

    return [row for row in rows if expected in str(row.get(field, "")).strip().lower()]


async def fred_series(params: dict[str, str]) -> dict[str, Any]:
    symbol = params.get("symbol", "DGS10")
    start_date = params.get("start_date")
    end_date = params.get("end_date")
    standard_params: dict[str, Any] = {"symbol": symbol}
    if start_date:
        standard_params["start_date"] = start_date
    if end_date:
        standard_params["end_date"] = end_date
    rows = await run_openbb_command(
        "/economy/fred_series",
        "fred",
        standard_params,
    )
    return dataset_payload(
        key="macro.fred-series",
        kind="time-series",
        title=f"FRED {symbol}",
        providers=["fred"],
        route="/economy/fred_series",
        rows=rows,
        preferred_date_field="date",
        view={"xField": "date", "defaultMetric": symbol},
        field_overrides={
            symbol: {
                "label": symbol,
            }
        },
    )


async def money_measures(params: dict[str, str]) -> dict[str, Any]:
    standard_params: dict[str, Any] = {}
    start_date = params.get("start_date")
    end_date = params.get("end_date")
    adjusted = params.get("adjusted")
    if start_date:
        standard_params["start_date"] = start_date
    if end_date:
        standard_params["end_date"] = end_date
    if adjusted in {"true", "false"}:
        standard_params["adjusted"] = adjusted == "true"

    rows = await run_openbb_command(
        "/economy/money_measures",
        "federal_reserve",
        standard_params,
    )
    return dataset_payload(
        key="macro.money-measures",
        kind="time-series",
        title="Money Measures",
        providers=["federal_reserve"],
        route="/economy/money_measures",
        rows=rows,
        preferred_date_field="month",
        view={"xField": "month", "defaultMetric": "m2"},
    )


async def unemployment(params: dict[str, str]) -> dict[str, Any]:
    country = params.get("country", "united_states")
    frequency = params.get("frequency")
    start_date = params.get("start_date")
    end_date = params.get("end_date")
    standard_params: dict[str, Any] = {"country": country}
    if frequency:
        standard_params["frequency"] = frequency
    if start_date:
        standard_params["start_date"] = start_date
    if end_date:
        standard_params["end_date"] = end_date
    rows = await run_openbb_command(
        "/economy/unemployment",
        "oecd",
        standard_params,
    )
    return dataset_payload(
        key="macro.unemployment",
        kind="time-series",
        title=f"Unemployment {country.replace('_', ' ').title()}",
        providers=["oecd"],
        route="/economy/unemployment",
        rows=rows,
        preferred_date_field="date",
        view={"xField": "date", "defaultMetric": "value"},
        field_overrides={
            "value": {
                "format": "ratio",
                "unit": "%",
            }
        },
    )


async def short_term_energy_outlook(params: dict[str, str]) -> dict[str, Any]:
    table = params.get("table")
    symbol = params.get("symbol")
    unit = params.get("unit")
    title_contains = params.get("title_contains")
    start_date = params.get("start_date")
    end_date = params.get("end_date")
    limit = int(params["limit"]) if params.get("limit") else 0
    standard_params: dict[str, Any] = {}
    if start_date:
        standard_params["start_date"] = start_date
    if end_date:
        standard_params["end_date"] = end_date
    if table:
        standard_params["table"] = table

    rows = await run_openbb_command(
        "/commodity/short_term_energy_outlook",
        "eia",
        standard_params,
    )
    rows = filter_rows_by_exact(rows, "table", table)
    rows = filter_rows_by_exact(rows, "symbol", symbol)
    rows = filter_rows_by_exact(rows, "unit", unit)
    rows = filter_rows_by_contains(rows, "title", title_contains)
    if limit > 0:
        rows = rows[-limit:]

    return dataset_payload(
        key="energy.short-term-energy-outlook",
        kind="time-series",
        title="Short-Term Energy Outlook",
        providers=["eia"],
        route="/commodity/short_term_energy_outlook",
        rows=rows,
        preferred_date_field="date",
        view={
            "xField": "date",
            "labelField": "title",
            "stackField": "title",
            "defaultMetric": "value",
        },
        field_overrides={
            "order": {
                "role": "dimension",
                "format": "integer",
            }
        },
    )


async def petroleum_status_report(params: dict[str, str]) -> dict[str, Any]:
    table = params.get("table")
    symbol = params.get("symbol")
    unit = params.get("unit")
    title_contains = params.get("title_contains")
    start_date = params.get("start_date")
    end_date = params.get("end_date")
    limit = int(params["limit"]) if params.get("limit") else 0
    standard_params: dict[str, Any] = {}
    if start_date:
        standard_params["start_date"] = start_date
    if end_date:
        standard_params["end_date"] = end_date

    rows = await run_openbb_command(
        "/commodity/petroleum_status_report",
        "eia",
        standard_params,
    )
    rows = filter_rows_by_exact(rows, "table", table)
    rows = filter_rows_by_exact(rows, "symbol", symbol)
    rows = filter_rows_by_exact(rows, "unit", unit)
    rows = filter_rows_by_contains(rows, "title", title_contains)
    if limit > 0:
        rows = rows[-limit:]

    return dataset_payload(
        key="energy.petroleum-status-report",
        kind="time-series",
        title="Petroleum Status Report",
        providers=["eia"],
        route="/commodity/petroleum_status_report",
        rows=rows,
        preferred_date_field="date",
        view={
            "xField": "date",
            "labelField": "title",
            "stackField": "title",
            "defaultMetric": "value",
        },
        field_overrides={
            "order": {
                "role": "dimension",
                "format": "integer",
            }
        },
    )


async def sec_form_13f(params: dict[str, str]) -> dict[str, Any]:
    symbol = params.get("symbol", "BRK-A")
    filing_date = params.get("date")
    limit = int(params.get("limit", "25"))
    standard_params: dict[str, Any] = {"symbol": symbol, "limit": limit}
    if filing_date:
        standard_params["date"] = filing_date
    rows = await run_openbb_command(
        "/equity/ownership/form_13f",
        "sec",
        standard_params,
    )
    return dataset_payload(
        key="filings.sec-form-13f",
        kind="table",
        title=f"{symbol} Form 13F",
        providers=["sec"],
        route="/equity/ownership/form_13f",
        rows=rows,
        preferred_date_field="period_ending",
        view={"labelField": "issuer", "defaultMetric": "weight"},
        field_overrides={
            "voting_authority_sole": {
                "format": "integer",
            },
            "voting_authority_shared": {
                "format": "integer",
            },
            "voting_authority_none": {
                "format": "integer",
            },
            "principal_amount": {
                "format": "integer",
            },
            "value": {
                "format": "currency",
                "unit": "USD",
            },
            "weight": {
                "format": "ratio",
                "unit": "%",
            },
        },
    )


async def risk_premium(params: dict[str, str]) -> dict[str, Any]:
    country = params.get("country")
    continent = params.get("continent")
    limit = int(params["limit"]) if params.get("limit") else 0
    rows = await run_openbb_command(
        "/economy/risk_premium",
        "fmp",
        {},
    )

    rows = filter_rows_by_exact(rows, "country", country)
    rows = filter_rows_by_exact(rows, "continent", continent)

    if limit > 0:
        rows = rows[:limit]

    return dataset_payload(
        key="macro.risk-premium",
        kind="table",
        title="Risk Premium",
        providers=["fmp"],
        route="/economy/risk_premium",
        rows=rows,
        view={
            "xField": "continent",
            "labelField": "country",
            "stackField": "country",
            "defaultMetric": "total_equity_risk_premium",
        },
        field_overrides={
            "total_equity_risk_premium": {
                "format": "percent",
                "unit": "%",
            },
            "country_risk_premium": {
                "format": "percent",
                "unit": "%",
            },
        },
    )


async def fred_series_catalog(params: dict[str, str]) -> dict[str, Any]:
    query = params.get("q", "").strip()
    rows = await run_openbb_command(
        "/economy/fred_search",
        "fred",
        {"query": query},
    )

    options: list[dict[str, Any]] = []
    seen: set[str] = set()
    normalized_query = query.strip().lower()
    ranked_rows = sorted(
        rows,
        key=lambda row: (
            0
            if str(row.get("series_id") or "").strip().lower() == normalized_query
            else 1
            if str(row.get("series_id") or "").strip().lower().startswith(normalized_query)
            else 2
            if normalized_query in str(row.get("title") or "").strip().lower()
            else 3,
            str(row.get("series_id") or ""),
        ),
    )

    for row in ranked_rows:
        series_id = str(row.get("series_id") or "").strip()
        if not series_id or series_id in seen:
            continue

        seen.add(series_id)
        title = str(row.get("title") or "").strip()
        frequency = str(row.get("frequency_short") or row.get("frequency") or "").strip()
        units = str(row.get("units_short") or row.get("units") or "").strip()
        meta_bits = [bit for bit in [frequency, units] if bit]
        meta = " · ".join(meta_bits) if meta_bits else None
        description = title or None
        options.append(
            {
                "value": series_id,
                "label": series_id,
                "description": description,
                "meta": meta,
            }
        )

        if len(options) >= 25:
            break

    return {
        "key": "fred-series",
        "label": "FRED Series",
        "query": query,
        "options": options,
    }


async def dataset_field_catalog(params: dict[str, str]) -> dict[str, Any]:
    dataset_key = params.get("dataset_key", "").strip()
    field_key = params.get("field", "").strip()
    query = params.get("q", "").strip().lower()

    if dataset_key not in DATASET_HANDLERS:
        raise ValueError(f"Unknown dataset key: {dataset_key}")
    if not field_key:
        raise ValueError("Missing dataset field key.")

    handler_params = {
        key: value
        for key, value in params.items()
        if key not in {"dataset_key", "field", "q", "limit"} and value.strip()
    }

    if dataset_key == "macro.unemployment" and field_key == "country" and "country" not in handler_params:
        handler_params["country"] = "all"

    payload = await DATASET_HANDLERS[dataset_key](handler_params)
    values: list[str] = []
    seen: set[str] = set()
    for row in payload.get("rows", []):
        raw = row.get(field_key)
        if raw is None:
            continue
        value = str(raw).strip()
        if not value:
            continue
        if query and query not in value.lower():
            continue
        if value in seen:
            continue
        seen.add(value)
        values.append(value)

    values.sort()
    options = [
        {
            "value": value,
            "label": value,
        }
        for value in values[:100]
    ]

    return {
        "key": "dataset-field",
        "label": f"{dataset_key}:{field_key}",
        "query": params.get("q", ""),
        "options": options,
    }


DATASET_HANDLERS = {
    "macro.fred-series": fred_series,
    "macro.money-measures": money_measures,
    "macro.unemployment": unemployment,
    "energy.short-term-energy-outlook": short_term_energy_outlook,
    "energy.petroleum-status-report": petroleum_status_report,
    "filings.sec-form-13f": sec_form_13f,
    "macro.risk-premium": risk_premium,
}

CATALOG_HANDLERS = {
    "fred-series": fred_series_catalog,
    "dataset-field": dataset_field_catalog,
}


@app.get("/health")
async def health() -> dict[str, Any]:
    prune_dataset_cache()
    return {
        "status": "ok",
        "service": "openbb-sidecar",
        "ssl_cert_file": os.environ.get("SSL_CERT_FILE"),
        "datasets": sorted(DATASET_HANDLERS.keys()),
        "catalogs": sorted(CATALOG_HANDLERS.keys()),
        "cache_entries": len(DATASET_CACHE),
    }


@app.get("/datasets/{dataset_key:path}")
async def get_dataset(dataset_key: str, request: Request) -> dict[str, Any]:
    handler = DATASET_HANDLERS.get(dataset_key)
    if handler is None:
        raise HTTPException(status_code=404, detail=f"Unknown dataset key: {dataset_key}")

    params = {key: value for key, value in request.query_params.items()}
    prune_dataset_cache()
    cached = read_cached_dataset(dataset_key, params)
    if cached is not None:
        return cached

    try:
        payload = await handler(params)
        write_cached_dataset(dataset_key, params, payload)
        return payload
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/catalogs/{catalog_key:path}")
async def get_catalog(catalog_key: str, request: Request) -> dict[str, Any]:
    handler = CATALOG_HANDLERS.get(catalog_key)
    if handler is None:
        raise HTTPException(status_code=404, detail=f"Unknown catalog key: {catalog_key}")

    params = {key: value for key, value in request.query_params.items()}
    query = params.get("q", "").strip()
    if len(query) < 2:
        return {
            "key": catalog_key,
            "query": query,
            "options": [],
            "note": "Enter at least 2 characters to search.",
        }

    prune_dataset_cache()
    cached = read_cached_catalog(catalog_key, params)
    if cached is not None:
        return cached

    try:
        payload = await handler(params)
        write_cached_catalog(catalog_key, params, payload)
        return payload
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


if __name__ == "__main__":
    host = os.environ.get("OPENBB_SIDECAR_HOST", "127.0.0.1")
    port = int(os.environ.get("OPENBB_SIDECAR_PORT", "5052"))
    uvicorn.run(app, host=host, port=port, log_level="info")
