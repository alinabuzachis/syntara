"""Metrics REST API and OpenMetrics endpoints.

This router is auto-discovered by the Router Discovery Framework and
registered under ``/api/v1/metrics``.

Endpoints:
    GET /api/v1/metrics            - query raw metrics (paginated JSON)
    GET /api/v1/metrics/summary    - quick health-check summary
    GET /api/v1/metrics/openmetrics - OpenMetrics scrape target
"""

import json
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from nexus.core.config.base import get_settings
from nexus.core.models.pagination import ResourcesResponse
from nexus.core.utils.cursor import (
    PaginationDirection,
    create_cursor_data,
    decode_cursor,
    encode_cursor,
)
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import (
    METRIC_CATEGORIES,
    MetricRecord,
    MetricsCategoryType,
    MetricsQuery,
    MetricsSummary,
    MetricType,
)

logger = structlog.stdlib.get_logger(__name__)

router = APIRouter(prefix="/metrics", tags=["metrics"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_metric_types(
    category: MetricsCategoryType | None,
    metric_type_value: str | None = None,
) -> set[MetricType] | None:
    """Map a category name and/or specific type value to MetricType members.

    When *metric_type_value* is provided it takes precedence, returning a
    single-element set.  Otherwise category-based resolution is used.
    """
    if metric_type_value:
        try:
            return {MetricType(metric_type_value)}
        except ValueError:
            return set()

    if category is None:
        return None
    types = METRIC_CATEGORIES.get(category)
    return set(types) if types else None


def _parse_labels(raw: str | None) -> dict[str, str] | None:
    """Parse a JSON-encoded labels string into a dict.

    Raises :class:`~fastapi.HTTPException` (400) when the value is valid
    JSON but not a JSON object.
    """
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.debug("Invalid labels JSON", raw_labels=raw)
        return None
    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="labels must be a JSON object",
        )
    return {str(k): str(v) for k, v in parsed.items()}


def _find_cursor_index(
    records: list[MetricRecord],
    cursor_id: str,
) -> int | None:
    """Return the index of the record matching *cursor_id*, or ``None``."""
    for idx, record in enumerate(records):
        if str(record.id) == cursor_id:
            return idx
    return None


def _resolve_cursor_offset(
    cursor: str | None,
    records: list[MetricRecord],
    limit: int,
) -> int:
    """Decode *cursor* and return the page offset into *records*."""
    if not cursor:
        return 0
    try:
        cursor_data = decode_cursor(cursor)
        cursor_id = cursor_data.get("id", "")
        direction_str = cursor_data.get("direction", PaginationDirection.NEXT.value)
        cursor_idx = _find_cursor_index(records, cursor_id)
    except (ValueError, KeyError):
        return 0

    if cursor_idx is None:
        return 0
    if direction_str == PaginationDirection.PREV.value:
        return max(0, cursor_idx - limit)
    return cursor_idx + 1


def _build_cursor(record: MetricRecord, direction: PaginationDirection) -> str:
    """Create an encoded cursor string for *record*."""
    return encode_cursor(
        create_cursor_data(
            resource_id=record.id,
            created_at=record.created_at,
            direction=direction,
        ),
    )


# ---------------------------------------------------------------------------
# MetricsListResponse - typed paginated response
# ---------------------------------------------------------------------------

MetricsListResponse = ResourcesResponse[MetricRecord]


# ---------------------------------------------------------------------------
# Shared query logic
# ---------------------------------------------------------------------------


def build_metrics_response(
    recorder: MetricsRecorder,
    params: MetricsQuery,
    extra_labels: dict[str, str] | None = None,
) -> MetricsListResponse:
    """Query and paginate metrics, shared by unified and component endpoints."""
    metric_types = _resolve_metric_types(params.category, params.metric_type)
    label_filter = _parse_labels(params.labels) or {}
    if extra_labels:
        label_filter.update(extra_labels)

    all_records: list[MetricRecord] = list(
        recorder.store.query(
            metric_types=metric_types,
            start_time=params.start_time,
            end_time=params.end_time,
            labels=label_filter or None,
        ),
    )

    reverse = not params.sort or params.sort.startswith("-")
    all_records.sort(key=lambda r: (r.created_at, r.id), reverse=reverse)

    total = len(all_records) if params.include_total else None
    limit = params.limit
    offset = _resolve_cursor_offset(params.cursor, all_records, limit)

    page = all_records[offset : offset + limit + 1]
    has_more = len(page) > limit
    trimmed = page[:limit]

    next_cursor = _build_cursor(trimmed[-1], PaginationDirection.NEXT) if has_more and trimmed else None
    prev_cursor = _build_cursor(trimmed[0], PaginationDirection.PREV) if offset > 0 and trimmed else None

    return MetricsListResponse(
        resources=trimmed,
        next=next_cursor,
        prev=prev_cursor,
        total=total,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("")
async def query_metrics(
    recorder: Annotated[MetricsRecorder, Depends(get_metrics_recorder)],
    params: Annotated[MetricsQuery, Query()],
) -> MetricsListResponse:
    """Query raw metrics with optional filtering and cursor-based pagination.

    Supports filtering by metric category, time range, and labels.

    Args:
        recorder: Application metrics recorder (injected).
        params: Query parameters including category, start_time, end_time,
            and standard pagination (limit, cursor, sort, include_total).

    Returns:
        Paginated list of MetricRecord resources.

    """
    return build_metrics_response(recorder, params)


@router.get("/summary")
async def get_metrics_summary(
    recorder: Annotated[MetricsRecorder, Depends(get_metrics_recorder)],
) -> MetricsSummary:
    """Return a quick summary of metric counts and rates.

    Args:
        recorder: Application metrics recorder (injected).

    Returns:
        MetricsSummary with aggregate counters and time period.

    """
    return recorder.get_summary()


@router.get("/openmetrics")
async def openmetrics_endpoint(
    recorder: Annotated[MetricsRecorder, Depends(get_metrics_recorder)],
) -> Response:
    """OpenMetrics scrape endpoint.

    Returns metrics in the text-based OpenMetrics exposition format
    understood by Prometheus, Grafana Agent, and compatible scrapers.
    When metrics_openmetrics_enabled is False, returns 404.

    Args:
        recorder: Application metrics recorder (injected).

    Returns:
        Plain-text response in OpenMetrics format.

    """
    from prometheus_client import generate_latest  # noqa: PLC0415

    settings = get_settings()
    if not settings.metrics_openmetrics_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Openmetrics endpoint is disabled",
        )
    body = generate_latest(recorder.prometheus.registry)
    return Response(content=body, media_type="text/plain; version=0.0.4; charset=utf-8")
