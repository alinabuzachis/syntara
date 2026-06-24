"""Service for managing scheduled trigger Temporal Schedules.

Scheduled triggers are managed entirely through Temporal Schedules. No database
model is needed because the schedule ID is deterministic:
``nexus-sched-{workflow_id}-{trigger_node_id}``.

This service synchronises Temporal Schedules when workflows are created,
updated, published, unpublished, or deleted.
"""

import asyncio
from typing import Any

import structlog
from pydantic import ValidationError
from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleState,
    ScheduleUpdate,
    ScheduleUpdateInput,
)
from temporalio.service import RPCError, RPCStatusCode

from nexus.core.config.base import get_settings
from nexus.core.tls.temporal import build_temporal_tls_config
from nexus.workflows.exceptions import TriggerValidationError
from nexus.workflows.utils.schedule_parser import (
    build_schedule_id,
    config_to_temporal_schedule,
)
from nexus.workflows.workflow_engine.models.workflow_definition import NodeType, ScheduledTriggerConfig

logger = structlog.stdlib.get_logger(__name__)

_client_lock = asyncio.Lock()
_cached_client: Client | None = None

_CONNECTION_ERRORS = frozenset({RPCStatusCode.UNAVAILABLE, RPCStatusCode.DEADLINE_EXCEEDED})


def _invalidate_client_cache() -> None:
    """Clear the cached Temporal client so the next call reconnects."""
    global _cached_client  # noqa: PLW0603
    _cached_client = None


async def _get_shared_client() -> Client | None:
    """Return a module-level cached Temporal client.

    Connects once and reuses across all ``ScheduledTriggerService`` instances
    so that lifecycle hooks share a single gRPC connection.  The cache is
    invalidated on connection-level errors so the next call reconnects.
    """
    global _cached_client  # noqa: PLW0603
    async with _client_lock:
        if _cached_client is not None:
            return _cached_client

        try:
            settings = get_settings()
            _cached_client = await Client.connect(
                settings.temporal_address,
                namespace=settings.temporal_namespace,
                tls=build_temporal_tls_config(),
            )
            return _cached_client
        except (OSError, RuntimeError, RPCError) as e:
            logger.warning("Temporal unavailable for schedule management", error=str(e))
            return None


class ScheduledTriggerService:
    """Service for managing Temporal Schedules for scheduled triggers.

    Unlike WebhookTriggerService which maintains a database lookup table,
    this service manages Temporal Schedules directly using deterministic
    schedule IDs derived from ``workflow_id`` and ``trigger_node_id``.

    Does not inherit from BaseService because it manages Temporal
    Schedules (external system) rather than database records.  No session
    or user context is required.
    """

    def __init__(self, temporal_client: Client | None = None) -> None:
        """Initialize ScheduledTriggerService.

        Args:
            temporal_client: Optional Temporal client for testing. If None,
                the shared module-level connection is used.

        """
        self._temporal_client = temporal_client

    async def _get_client(self) -> Client | None:
        """Get a Temporal client.

        Uses the injected client if provided, otherwise the shared connection.
        """
        if self._temporal_client is not None:
            return self._temporal_client
        return await _get_shared_client()

    async def sync_scheduled_triggers(
        self,
        workflow_id: str,
        workflow_definition: dict[str, Any],
    ) -> int:
        """Synchronise Temporal Schedules from a workflow definition.

        Creates or updates schedules for each scheduled trigger node and
        deletes schedules for trigger nodes that were removed.  Only called
        on publish — unpublish and delete use ``delete_triggers_for_workflow``
        instead.

        Args:
            workflow_id: The workflow UUID (as string).
            workflow_definition: The full workflow definition dict.

        Returns:
            Number of scheduled triggers processed.

        Raises:
            TriggerValidationError: If a scheduled trigger config is invalid.

        """
        client = await self._get_client()
        if client is None:
            logger.warning(
                "Skipping schedule sync: Temporal unavailable",
                workflow_id=workflow_id,
            )
            return 0

        # Extract scheduled trigger nodes from definition
        triggers = workflow_definition.get("triggers", [])
        scheduled_nodes: dict[str, dict[str, Any]] = {}
        for trigger in triggers:
            if trigger.get("type") == NodeType.SCHEDULED_TRIGGER:
                node_id = trigger.get("id")
                if not node_id:
                    logger.warning(
                        "Skipping scheduled trigger with missing id",
                        workflow_id=workflow_id,
                    )
                    continue
                scheduled_nodes[node_id] = trigger.get("parameters", {})

        settings = get_settings()
        task_queue = settings.task_queue
        processed = 0

        # Create or update schedules for current trigger nodes
        for node_id, config in scheduled_nodes.items():
            # Validate config
            try:
                ScheduledTriggerConfig.model_validate(config)
            except ValidationError as e:
                msg = f"Invalid scheduled trigger config for node '{node_id}': {e}"
                raise TriggerValidationError(msg) from e

            schedule_id = build_schedule_id(workflow_id, node_id)
            await self._create_or_update_schedule(client, schedule_id, workflow_id, node_id, config, task_queue)
            processed += 1

        # Delete schedules for trigger nodes removed from the definition
        expected_ids = {build_schedule_id(workflow_id, nid) for nid in scheduled_nodes}
        existing_ids = await self._list_workflow_schedules(client, workflow_id)
        stale_ids = existing_ids - expected_ids
        for stale_id in stale_ids:
            await self._delete_schedule(client, stale_id)
            logger.info(
                "Deleted stale Temporal Schedule for removed trigger node",
                schedule_id=stale_id,
                workflow_id=workflow_id,
            )

        logger.info(
            "Synced scheduled triggers",
            workflow_id=workflow_id,
            total=processed,
        )

        return processed

    async def delete_triggers_for_workflow(
        self,
        workflow_id: str,
    ) -> int:
        """Delete all Temporal Schedules for a workflow.

        Uses a prefix scan to find schedules rather than iterating the
        workflow definition, so schedules created by any version are
        cleaned up — not just those in the current draft.

        Args:
            workflow_id: The workflow UUID (as string).

        Returns:
            Number of schedules deleted.

        """
        client = await self._get_client()
        if client is None:
            logger.warning(
                "Skipping schedule deletion: Temporal unavailable",
                workflow_id=workflow_id,
            )
            return 0

        all_schedule_ids = await self._list_workflow_schedules(client, workflow_id)
        deleted = 0

        for schedule_id in all_schedule_ids:
            if await self._delete_schedule(client, schedule_id):
                deleted += 1

        if deleted:
            logger.info(
                "Deleted scheduled triggers for workflow",
                workflow_id=workflow_id,
                count=deleted,
            )

        return deleted

    async def _create_or_update_schedule(
        self,
        client: Client,
        schedule_id: str,
        workflow_id: str,
        trigger_node_id: str,
        config: dict[str, Any],
        task_queue: str,
    ) -> None:
        """Create or update a Temporal Schedule.

        If the schedule already exists, it is updated. Otherwise, a new
        schedule is created.
        """
        spec, policy = config_to_temporal_schedule(config)

        action = ScheduleActionStartWorkflow(
            "scheduled_workflow_launcher",
            args=[workflow_id, trigger_node_id],
            id=f"sched-exec-{workflow_id}-{trigger_node_id}",
            task_queue=task_queue,
        )

        schedule = Schedule(
            action=action,
            spec=spec,
            policy=policy,
            state=ScheduleState(paused=False),
        )

        try:
            await client.create_schedule(schedule_id, schedule)
            logger.info(
                "Created Temporal Schedule",
                schedule_id=schedule_id,
                workflow_id=workflow_id,
                trigger_node_id=trigger_node_id,
            )
        except RPCError as e:
            if e.status == RPCStatusCode.ALREADY_EXISTS:
                handle = client.get_schedule_handle(schedule_id)

                def _updater(_: ScheduleUpdateInput) -> ScheduleUpdate:
                    return ScheduleUpdate(schedule=schedule)

                await handle.update(_updater)
                logger.info(
                    "Updated Temporal Schedule",
                    schedule_id=schedule_id,
                    workflow_id=workflow_id,
                    trigger_node_id=trigger_node_id,
                )
            elif e.status in _CONNECTION_ERRORS:
                _invalidate_client_cache()
                raise
            else:
                raise

    async def _list_workflow_schedules(self, client: Client, workflow_id: str) -> set[str]:
        """List all Temporal Schedule IDs belonging to a workflow."""
        prefix = f"nexus-sched-{workflow_id}-"
        schedule_ids: set[str] = set()
        async for entry in await client.list_schedules():
            if entry.id.startswith(prefix):
                schedule_ids.add(entry.id)
        return schedule_ids

    async def _delete_schedule(self, client: Client, schedule_id: str) -> bool:
        """Delete a Temporal Schedule if it exists.

        Returns True if a schedule was deleted, False if it didn't exist.
        """
        handle = client.get_schedule_handle(schedule_id)
        try:
            await handle.delete()
            logger.info("Deleted Temporal Schedule", schedule_id=schedule_id)
            return True
        except RPCError as e:
            if e.status != RPCStatusCode.NOT_FOUND:
                if e.status in _CONNECTION_ERRORS:
                    _invalidate_client_cache()
                raise
            logger.debug("No schedule to delete", schedule_id=schedule_id)
            return False
