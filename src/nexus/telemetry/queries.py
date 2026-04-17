"""Database aggregation queries for periodic analytics.

All queries are read-only, non-locking, stateless snapshots
of the current database state. No time-based filtering.
Soft-deleted records are excluded from all counts.
"""

from sqlalchemy import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.models.invocation import Invocation
from nexus.agent_orchestrator.token_manager.models import TokenUsageRecord
from nexus.credentials.models.credential import Credential
from nexus.credentials.models.credential_type import CredentialType
from nexus.telemetry.events.system_analytics import (
    CredentialCounts,
    ExecutionCounts,
    ModelUsage,
    ToolCounts,
    WorkflowCounts,
)
from nexus.tool_manager.models.usage_counter import CounterType, UsageCounter
from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.models.workflow import Workflow


async def query_workflow_counts(session: AsyncSession) -> WorkflowCounts:
    """Query current workflow counts from database (excludes soft-deleted)."""
    not_deleted = Workflow.deleted_at.is_(None)  # type: ignore[union-attr]
    total = await session.scalar(select(func.count(Workflow.id)).where(not_deleted))  # type: ignore[arg-type]
    is_enabled = Workflow.is_enabled.is_(True)  # type: ignore[attr-defined]
    enabled = await session.scalar(
        select(func.count(Workflow.id)).where(  # type: ignore[arg-type]
            is_enabled,
            not_deleted,
        )
    )
    return WorkflowCounts(
        total=total or 0,
        enabled=enabled or 0,
        disabled=(total or 0) - (enabled or 0),
    )


async def query_execution_counts(session: AsyncSession) -> ExecutionCounts:
    """Query current execution counts from database (excludes soft-deleted)."""
    not_deleted = Execution.deleted_at.is_(None)  # type: ignore[union-attr]
    result = await session.exec(
        select(Execution.status, func.count(Execution.id)).where(not_deleted).group_by(Execution.status)  # type: ignore[call-overload,arg-type]
    )
    status_counts: dict[str, int] = {}
    for row in result:
        key = row[0].value if isinstance(row[0], ExecutionStatus) else str(row[0])
        status_counts[key] = row[1]

    avg_duration = await session.scalar(
        select(func.avg(func.extract("epoch", Execution.completed_at - Execution.created_at))).where(  # type: ignore[operator,arg-type]
            Execution.completed_at.isnot(None),  # type: ignore[union-attr]
            not_deleted,
        )
    )

    return ExecutionCounts(
        total=sum(status_counts.values()),
        completed=status_counts.get("completed", 0),
        failed=status_counts.get("failed", 0),
        cancelled=status_counts.get("cancelled", 0),
        running=status_counts.get("running", 0),
        pending=status_counts.get("pending", 0),
        paused=status_counts.get("paused", 0),
        avg_duration_seconds=float(avg_duration) if avg_duration is not None else 0.0,
    )


async def query_credential_counts(session: AsyncSession) -> CredentialCounts:
    """Query current credential counts from database (excludes soft-deleted).

    Returns total count and per-type breakdown by credential type name.
    """
    not_deleted = Credential.deleted_at.is_(None)  # type: ignore[union-attr]

    result = await session.exec(
        select(  # type: ignore[call-overload]
            CredentialType.name,
            func.count(Credential.id),  # type: ignore[arg-type]
        )
        .join(CredentialType, Credential.credential_type_id == CredentialType.id)
        .where(not_deleted)
        .group_by(CredentialType.name)
    )
    counts_by_type: dict[str, int] = {}
    for type_name, count in result:
        counts_by_type[type_name] = int(count)

    return CredentialCounts(
        total=sum(counts_by_type.values()),
        type=counts_by_type,
    )


async def query_model_usage(session: AsyncSession) -> list[ModelUsage]:
    """Query aggregated token usage per model from database.

    Joins token_usage_records with invocations to get the model name,
    then aggregates prompt_tokens, completion_tokens, and invocation count
    grouped by model. Only includes records with a known model and actual
    (post-LLM) token counts.
    """
    stmt = (
        select(  # type: ignore[call-overload]
            Invocation.model_name,
            func.coalesce(func.sum(TokenUsageRecord.prompt_tokens), 0),
            func.coalesce(func.sum(TokenUsageRecord.completion_tokens), 0),
            func.coalesce(func.count(TokenUsageRecord.id), 0),  # type: ignore[arg-type]
        )
        .join(Invocation, TokenUsageRecord.invocation_id == Invocation.id)
        .where(
            Invocation.model_name.isnot(None),  # type: ignore[union-attr]
            TokenUsageRecord.prompt_tokens.isnot(None),  # type: ignore[union-attr]
        )
        .group_by(Invocation.model_name)
    )
    result = await session.exec(stmt)
    return [
        ModelUsage(
            model=model_name,
            total_prompt_tokens=int(prompt),
            total_completion_tokens=int(completion),
            total_tokens=int(prompt) + int(completion),
            invocation_count=int(count),
        )
        for model_name, prompt, completion, count in result
    ]


async def query_tool_counts(session: AsyncSession) -> ToolCounts:
    """Query all-time cumulative tool execution counts from usage_counters table."""
    tool_filter = UsageCounter.counter_type == CounterType.TOOL
    result = await session.exec(
        select(  # type: ignore[call-overload]
            func.coalesce(func.sum(UsageCounter.request_count), 0),
            func.coalesce(func.sum(UsageCounter.success_count), 0),
            func.coalesce(func.sum(UsageCounter.error_count), 0),
            func.coalesce(func.sum(UsageCounter.timeout_count), 0),
            func.count(UsageCounter.tool_id.distinct()),  # type: ignore[union-attr]
        ).where(tool_filter)  # type: ignore[arg-type]
    )
    row = result.one()
    return ToolCounts(
        success_count=int(row[1]),
        error_count=int(row[2]),
        timeout_count=int(row[3]),
        distinct_tools=int(row[4]),
    )


def get_enabled_feature_flags() -> list[str]:
    """Return list of enabled feature flag names.

    Currently returns an empty list — no feature flag system exists.
    """
    return []
