"""Workflow activity implementations."""

from collections.abc import Callable
from typing import Any

from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName

from .aap_job_template_activity import execute_aap_job_template_activity
from .agentic_activity import execute_agentic_activity
from .approval_activity import create_approval_request_activity
from .condition import condition
from .converge import converge
from .credential_resolution_activity import resolve_workflow_credentials
from .execution_tracker import (
    cancel_execution_activities,
    create_activity_execution,
    get_activity_execution,
    get_execution_activities,
    update_activity_execution,
)
from .http_request_activity import execute_http_request_activity
from .internal import register_activity_monitoring
from .loop import loop
from .manual_trigger import manual_trigger
from .script_activity import execute_script_activity

_TEMPORAL_ACTIVITIES: list[Callable[..., Any]] = [
    register_activity_monitoring,
    resolve_workflow_credentials,
    execute_aap_job_template_activity,
    execute_agentic_activity,
    create_approval_request_activity,
    condition,
    converge,
    execute_http_request_activity,
    loop,
    manual_trigger,
    execute_script_activity,
]

ACTIVITY_REGISTRY: dict[ActivityName, Callable[..., Any]] = {
    ActivityName(fn.__temporal_activity_definition.name): fn  # type: ignore[attr-defined]  # noqa: SLF001
    for fn in _TEMPORAL_ACTIVITIES
}

__all__ = [
    "ACTIVITY_REGISTRY",
    "cancel_execution_activities",
    "create_activity_execution",
    "get_activity_execution",
    "get_execution_activities",
    "update_activity_execution",
]
