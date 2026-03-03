"""Metrics REST API and OpenMetrics endpoints.

This router is auto-discovered by the Router Discovery Framework and
registered under ``/api/v1/metrics``.

Endpoints:
    GET /api/v1/metrics            - query raw metrics (paginated JSON)
    GET /api/v1/metrics/summary    - quick health-check summary
    GET /api/v1/metrics/openmetrics - OpenMetrics scrape target
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from nexus.core.config.base import get_settings
from nexus.core.models.base.pagination import ResourcesResponse
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
    MetricsQuery,
    MetricsSummary,
    MetricType,
)

router = APIRouter(prefix="/metrics", tags=["metrics"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_metric_types(category: str | None) -> set[MetricType] | None:
    """Map a category name to the corresponding MetricType members."""
    if category is None or category == "all":
        return None
    types = METRIC_CATEGORIES.get(category)
    return set(types) if types else None


def _find_cursor_index(
    records: list[MetricRecord],
    cursor_id: str,
) -> int | None:
    """Return the index of the record matching *cursor_id*, or ``None``."""
    for idx, record in enumerate(records):
        if str(record.id) == cursor_id:
            return idx
    return None


# ---------------------------------------------------------------------------
# MetricsListResponse - typed paginated response
# ---------------------------------------------------------------------------

MetricsListResponse = ResourcesResponse[MetricRecord]


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
    metric_types = _resolve_metric_types(params.category)

    all_records: list[MetricRecord] = list(
        recorder.store.query(
            metric_types=metric_types,
            start_time=params.start_time,
            end_time=params.end_time,
        ),
    )

    reverse = True
    if params.sort:
        reverse = params.sort.startswith("-")

    all_records.sort(key=lambda r: (r.created_at, r.id), reverse=reverse)

    total = len(all_records) if params.include_total else None

    limit = params.limit

    # Resolve cursor position and direction
    offset = 0
    if params.cursor:
        try:
            cursor_data = decode_cursor(params.cursor)
            cursor_id = cursor_data.get("id", "")
            direction_str = cursor_data.get("direction", PaginationDirection.NEXT.value)
            cursor_idx = _find_cursor_index(all_records, cursor_id)

            if cursor_idx is not None:
                if direction_str == PaginationDirection.PREV.value:
                    offset = max(0, cursor_idx - limit)
                else:
                    offset = cursor_idx + 1
        except (ValueError, KeyError):
            offset = 0

    page = all_records[offset : offset + limit + 1]

    has_more = len(page) > limit
    trimmed = page[:limit]

    next_cursor: str | None = None
    if has_more and trimmed:
        last = trimmed[-1]
        next_cursor = encode_cursor(
            create_cursor_data(
                resource_id=last.id,
                created_at=last.created_at,
                direction=PaginationDirection.NEXT,
            ),
        )

    prev_cursor: str | None = None
    if offset > 0 and trimmed:
        first = trimmed[0]
        prev_cursor = encode_cursor(
            create_cursor_data(
                resource_id=first.id,
                created_at=first.created_at,
                direction=PaginationDirection.PREV,
            ),
        )

    return MetricsListResponse(
        resources=trimmed,
        next=next_cursor,
        prev=prev_cursor,
        total=total,
    )


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
