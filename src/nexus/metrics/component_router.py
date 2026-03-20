"""Per-component metrics shortcut endpoints.

Auto-discovered by the Router Discovery Framework.  Each endpoint is a
thin wrapper around the unified ``/api/v1/metrics`` query logic that
automatically injects the ``component`` label filter.

Endpoints:
    GET /api/v1/{component}/metrics - query metrics for a specific component
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.router import MetricsListResponse, build_metrics_response
from nexus.metrics.types import COMPONENT_LABELS, MetricsQuery

router = APIRouter(tags=["metrics", "components"])


@router.get("/{component}/metrics")
async def get_component_metrics(
    component: str,
    recorder: Annotated[MetricsRecorder, Depends(get_metrics_recorder)],
    params: Annotated[MetricsQuery, Query()],
) -> MetricsListResponse:
    """Query metrics for a specific component.

    Equivalent to ``GET /api/v1/metrics?labels={"component": "<component>"}``
    but validates the component name and injects the label automatically.

    Args:
        component: One of the 9 valid component identifiers.
        recorder: Application metrics recorder (injected).
        params: Query parameters (same as the unified metrics endpoint).

    Returns:
        Paginated list of MetricRecord resources for the component.

    Raises:
        HTTPException: 404 if *component* is not a recognised component name.

    """
    if component not in COMPONENT_LABELS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Component '{component}' does not exist",
        )
    return build_metrics_response(recorder, params, extra_labels={"component": component})
