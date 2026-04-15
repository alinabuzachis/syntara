"""Tool metrics REST API endpoints.

This router is auto-discovered by the Router Discovery Framework and
registered under ``/api/v1/tool_manager/metrics``.

Endpoints:
    GET /api/v1/tool_manager/metrics/tools      - aggregated per-tool metrics summary
    GET /api/v1/tool_manager/metrics/executions  - paginated tool execution history
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from nexus.tool_manager.models.tool_metrics_response import (
    ToolExecutionListParams,
    ToolExecutionListResponse,
    ToolMetricsQuery,
    ToolMetricsToolSummaryListResponse,
)
from nexus.tool_manager.services.tool_metrics_service import (
    ToolMetricsService,
    get_tool_metrics_service,
)

router = APIRouter(prefix="/tool_manager/metrics", tags=["tool_metrics"])


@router.get("/tools")
async def get_tool_metrics_summary(
    service: Annotated[ToolMetricsService, Depends(get_tool_metrics_service)],
    params: Annotated[ToolMetricsQuery, Query()],
) -> ToolMetricsToolSummaryListResponse:
    """Return aggregated per-tool metrics summary.

    Supports filtering by namespaced_name and time range.
    Uses UsageCounter for unfiltered queries (fast path) and SQL aggregation
    for time-filtered queries (flexible path).
    """
    summaries = await service.get_tool_metrics_summary(params)
    return ToolMetricsToolSummaryListResponse(resources=summaries)


@router.get("/executions")
async def list_tool_executions(
    service: Annotated[ToolMetricsService, Depends(get_tool_metrics_service)],
    params: Annotated[ToolExecutionListParams, Query()],
) -> ToolExecutionListResponse:
    """Return paginated tool execution history.

    Supports filtering by namespaced_name, status, and time range.
    Uses cursor-based pagination consistent with other Nexus list endpoints.
    """
    return await service.list_executions(params)
