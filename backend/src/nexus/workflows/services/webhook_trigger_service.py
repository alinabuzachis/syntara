"""Service for managing webhook trigger registrations.

Webhook triggers are auto-synced from workflow definitions. This service handles
the lookup table CRUD and payload validation. Supports multiple trigger types
(webhook_trigger, eda_trigger) via the ``trigger_type`` discriminator.
"""

import re
from typing import Any
from uuid import UUID, uuid4

import structlog
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.workflows.exceptions import (
    TriggerValidationError,
    WebhookTriggerNotFoundError,
    WebhookTriggerPathConflictError,
)
from nexus.workflows.models.webhook_trigger import WebhookTrigger, WebhookTriggerRead
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.workflow_engine.models.workflow_definition import NodeType, WebhookTriggerConfig

logger = structlog.stdlib.get_logger(__name__)

WEBHOOK_TRIGGER_TYPES: tuple[str, ...] = (
    NodeType.WEBHOOK_TRIGGER,
    NodeType.EDA_TRIGGER,
)


class WebhookTriggerService(BaseService):
    """Service for managing the webhook trigger lookup table.

    Webhook triggers are derived from workflow definitions. This service
    synchronises the lookup table when workflows are created, updated, or deleted.
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize WebhookTriggerService."""
        super().__init__(session, user)

    async def get_by_webhook_path(
        self,
        webhook_path: str,
        trigger_type: str = NodeType.WEBHOOK_TRIGGER,
    ) -> WebhookTrigger:
        """Look up a webhook trigger by its path and type.

        Args:
            webhook_path: The URL slug to look up.
            trigger_type: The trigger type to filter by (default: "webhook_trigger").

        Returns:
            The matching WebhookTrigger record.

        Raises:
            WebhookTriggerNotFoundError: If no trigger exists for this path/type.

        """
        result = await self.session.exec(
            select(WebhookTrigger)
            .join(Workflow, WebhookTrigger.workflow_id == Workflow.id)  # type: ignore[arg-type]
            .where(
                WebhookTrigger.trigger_type == trigger_type,
                WebhookTrigger.webhook_path == webhook_path,
                WebhookTrigger.is_enabled == True,  # noqa: E712
                Workflow.is_enabled == True,  # noqa: E712
                Workflow.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        trigger = result.one_or_none()
        if trigger is None:
            raise WebhookTriggerNotFoundError(webhook_path, trigger_type=trigger_type)
        return trigger

    async def sync_webhook_triggers(
        self,
        workflow_id: UUID,
        workflow_definition: dict[str, Any],
        *,
        is_enabled: bool = True,
        trigger_type: str = NodeType.WEBHOOK_TRIGGER,
    ) -> list[WebhookTriggerRead]:
        """Synchronise webhook trigger lookup rows from a workflow definition.

        Compares trigger nodes in the definition against existing DB rows
        for the given ``trigger_type``. Creates new rows, updates existing
        ones, and deletes removed ones.

        Args:
            workflow_id: The workflow ID.
            workflow_definition: The full workflow definition dict.
            is_enabled: Whether the workflow is enabled.
            trigger_type: The trigger type to sync (default: "webhook_trigger").

        Returns:
            List of WebhookTriggerRead for synced triggers.

        Raises:
            TriggerValidationError: If a webhook trigger node has an
                invalid or missing webhook_path.
            WebhookTriggerPathConflictError: If a webhook path is already used
                by a different workflow.

        """
        # Extract trigger nodes matching the given type from definition
        triggers = workflow_definition.get("triggers", [])
        webhook_nodes: dict[str, dict[str, Any]] = {}
        for trigger in triggers:
            if trigger.get("type") == trigger_type:
                node_id = trigger.get("id")
                if not node_id:
                    logger.warning(
                        "Skipping trigger with missing id",
                        workflow_id=str(workflow_id),
                        trigger_type=trigger_type,
                    )
                    continue
                webhook_nodes[node_id] = trigger.get("parameters", {})

        # Fetch existing triggers for this workflow and type
        result = await self.session.exec(
            select(WebhookTrigger).where(
                WebhookTrigger.workflow_id == workflow_id,
                WebhookTrigger.trigger_type == trigger_type,
            )
        )
        existing_triggers = {t.trigger_node_id: t for t in result.all()}

        results: list[WebhookTriggerRead] = []

        # Create or update triggers
        for node_id, parameters in webhook_nodes.items():
            try:
                validated_parameters = WebhookTriggerConfig.model_validate(parameters)
            except ValidationError as e:
                msg = f"Invalid webhook trigger parameters for node '{node_id}': {e}"
                raise TriggerValidationError(msg) from e
            webhook_path = validated_parameters.webhook_path
            input_schema = validated_parameters.input_schema

            if node_id in existing_triggers:
                # Update existing trigger
                trigger = existing_triggers.pop(node_id)
                trigger.webhook_path = webhook_path
                trigger.input_schema = input_schema
                trigger.is_enabled = is_enabled
                self.session.add(trigger)
                results.append(WebhookTriggerRead.model_validate(trigger))
            else:
                # Create new trigger
                trigger = WebhookTrigger(
                    id=uuid4(),
                    trigger_type=trigger_type,
                    webhook_path=webhook_path,
                    workflow_id=workflow_id,
                    trigger_node_id=node_id,
                    input_schema=input_schema,
                    is_enabled=is_enabled,
                )
                self.session.add(trigger)
                results.append(WebhookTriggerRead.model_validate(trigger))

        # Delete triggers whose nodes were removed from the definition
        for trigger in existing_triggers.values():
            await self.session.delete(trigger)
            logger.info(
                "Deleted webhook trigger for removed node",
                trigger_id=trigger.id,
                trigger_node_id=trigger.trigger_node_id,
                webhook_path=trigger.webhook_path,
            )

        # Flush — catch path uniqueness violations
        try:
            await self.session.flush()
        except IntegrityError as e:
            await self.session.rollback()
            error_str = str(e)
            if "ix_webhook_triggers_type_path_unique" in error_str or "webhook_path" in error_str:
                # Extract the actual conflicting path from PostgreSQL DETAIL
                match = re.search(r"Key \(trigger_type, webhook_path\)=\([^,]+, ([^)]+)\)", error_str)
                conflicting_path = match.group(1) if match else "<unknown>"
                raise WebhookTriggerPathConflictError(conflicting_path) from e
            raise

        logger.info(
            "Synced webhook triggers",
            workflow_id=workflow_id,
            trigger_type=trigger_type,
            total=len(results),
            deleted=len(existing_triggers),
        )

        return results

    async def delete_triggers_for_workflow(self, workflow_id: UUID) -> int:
        """Delete all webhook triggers for a workflow.

        Args:
            workflow_id: The workflow ID.

        Returns:
            Number of triggers deleted.

        """
        result = await self.session.exec(select(WebhookTrigger).where(WebhookTrigger.workflow_id == workflow_id))
        triggers = result.all()
        for trigger in triggers:
            await self.session.delete(trigger)

        if triggers:
            await self.session.flush()
            logger.info(
                "Deleted webhook triggers for workflow",
                workflow_id=workflow_id,
                count=len(triggers),
            )

        return len(triggers)
