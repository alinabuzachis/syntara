"""Credential Service for database operations and business logic.

Handles CRUD operations with encryption/decryption delegated to SecretService
and secret masking in API responses.
"""

import json
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import Select, case, func, literal_column, or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.core.lib.encryption import ENCRYPTED_SENTINEL, EncryptionError
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin, EnrichQueryMixin
from nexus.core.services.secret_service import SecretService
from nexus.credentials.exceptions import (
    CredentialDecryptionError,
    CredentialNameConflictError,
    CredentialNotFoundError,
    CredentialValidationError,
)
from nexus.credentials.models.credential import (
    Credential,
    CredentialCreate,
    CredentialListResponse,
    CredentialPatch,
    CredentialRead,
    CredentialWorkflowRef,
)
from nexus.credentials.models.credential_type import CredentialType
from nexus.workflows.utils.activity_traversal import traverse_activities

logger = structlog.stdlib.get_logger(__name__)


MAX_INPUTS_SIZE_BYTES = 65536  # 64KB max for serialized inputs payload


def _get_secret_field_ids(type_inputs: dict[str, Any]) -> set[str]:
    """Extract the set of field IDs marked as secret from a credential type's inputs schema."""
    fields = type_inputs.get("fields", [])
    return {f["id"] for f in fields if f.get("secret", False)}


def _validate_inputs(
    inputs: dict[str, Any],
    type_inputs: dict[str, Any],
    *,
    allow_sentinel: bool = False,
) -> None:
    """Validate credential inputs against the type schema.

    Args:
        inputs: User-provided field values.
        type_inputs: CredentialType.inputs schema with fields and required arrays.
        allow_sentinel: If True, $encrypted$ values are allowed (for PATCH updates).

    Raises:
        CredentialValidationError: If validation fails.

    """
    fields = type_inputs.get("fields", [])
    field_defs = {f["id"]: f for f in fields}
    required = set(type_inputs.get("required", []))
    valid_ids = set(field_defs.keys())

    serialized_size = len(json.dumps(inputs).encode("utf-8"))
    if serialized_size > MAX_INPUTS_SIZE_BYTES:
        msg = f"Inputs payload exceeds maximum size of {MAX_INPUTS_SIZE_BYTES} bytes ({serialized_size} bytes)"
        raise CredentialValidationError(msg)

    # Reject unknown field IDs
    unknown = set(inputs.keys()) - valid_ids
    if unknown:
        msg = f"Unknown field(s): {', '.join(sorted(unknown))}"
        raise CredentialValidationError(msg)

    # Reject $encrypted$ sentinel on create (reserved for PATCH masking)
    if not allow_sentinel:
        sentinel_fields = [k for k, v in inputs.items() if v == ENCRYPTED_SENTINEL]
        if sentinel_fields:
            msg = (
                f"The value '$encrypted$' is reserved and cannot be used as input "
                f"for field(s): {', '.join(sentinel_fields)}"
            )
            raise CredentialValidationError(msg)

    # Check required fields — only on create (PATCH is partial, missing fields are preserved)
    if not allow_sentinel:
        provided = {k for k, v in inputs.items() if v is not None}
        missing = required - provided
        if missing:
            msg = f"Missing required field(s): {', '.join(sorted(missing))}"
            raise CredentialValidationError(msg)

    # Validate choices
    for field_id, value in inputs.items():
        if value is None or value == ENCRYPTED_SENTINEL:
            continue
        field_def = field_defs.get(field_id, {})
        choices = field_def.get("choices")
        if choices and value not in choices:
            msg = f"Invalid value '{value}' for field '{field_id}'. Must be one of: {', '.join(choices)}"
            raise CredentialValidationError(msg)


class CredentialEnrichQuery(EnrichQueryMixin):
    """Eager-load credential type relationship."""

    def enrich(  # type: ignore[override]
        self,
        query: Select[tuple[Credential]] | SelectOfScalar[tuple[Credential]],
    ) -> Select[tuple[Credential]] | SelectOfScalar[tuple[Credential]]:
        """Extend query to eager load credential type."""
        return query.options(selectinload(Credential.credential_type))  # type: ignore[arg-type]


class CredentialConvertResource(ConvertResourceMixin):
    """Convert Credential to CredentialRead with secret masking for list responses."""

    def __init__(self, credential_type_cache: dict[UUID, CredentialType]) -> None:
        """Initialize with type cache for masking lookups."""
        self._type_cache = credential_type_cache

    def convert_resource(self, resource: Credential) -> CredentialRead:  # type: ignore[override]
        """Convert Credential to read schema with all fields masked as $encrypted$."""
        read = CredentialRead.model_validate(resource)
        credential_type = self._type_cache.get(resource.credential_type_id) or resource.credential_type
        if credential_type:
            read.inputs = _mask_all_secrets(credential_type.inputs)
        return read


def _mask_all_secrets(type_inputs: dict[str, Any]) -> dict[str, Any]:
    """Mask all fields with $encrypted$ sentinel for list responses (no decryption)."""
    fields = type_inputs.get("fields", [])
    return {f["id"]: ENCRYPTED_SENTINEL for f in fields}


def _extract_credential_node_names(workflow_definition: dict[str, Any], credential_id: str) -> list[str]:
    """Extract activity names from a workflow definition that reference a given credential.

    Uses the shared traverse_activities utility to walk nested activity structures
    (parallel branches, sequences, conditions, loops) and find all activities
    with a matching credentialId in their task config.
    """

    def _match_credential(activity: dict[str, Any], _path: str) -> str | None:
        task = activity.get("task", {})
        if task and task.get("config", {}).get("credentialId") == credential_id:
            name: str = activity.get("name") or activity.get("id", "Unknown")
            return name
        return None

    root_activities = workflow_definition.get("workflow", {}).get("activities", [])
    return traverse_activities(root_activities, _match_credential)


class CredentialService(BaseService):
    """Service for Credential CRUD operations with encryption via SecretService."""

    def __init__(self, session: AsyncSession, user: User, secret_service: SecretService) -> None:
        """Initialize with database session, user context, and SecretService."""
        self._secret_service = secret_service
        self._type_cache: dict[UUID, CredentialType] = {}
        super().__init__(
            session,
            user,
            enrich_query_mixin=CredentialEnrichQuery(),
            convert_resource_mixin=CredentialConvertResource(self._type_cache),
        )

    async def _get_credential_type(self, credential_type_id: UUID) -> CredentialType:
        """Fetch and cache a credential type by ID."""
        if credential_type_id in self._type_cache:
            return self._type_cache[credential_type_id]
        result = await self.session.get(CredentialType, credential_type_id)
        if not result:
            msg = f"Credential type with ID '{credential_type_id}' not found"
            raise CredentialNotFoundError(msg)
        self._type_cache[credential_type_id] = result
        return result

    def _build_masked_response(
        self,
        credential: Credential,
        credential_type: CredentialType,
        decrypted_inputs: dict[str, Any],
    ) -> CredentialRead:
        """Build a CredentialRead with selective masking — secret fields masked, non-secret in plaintext."""
        secret_field_ids = _get_secret_field_ids(credential_type.inputs)
        read = CredentialRead.model_validate(credential)
        read.inputs = {
            field_id: (ENCRYPTED_SENTINEL if field_id in secret_field_ids else value)
            for field_id, value in decrypted_inputs.items()
        }
        return read

    async def _resolve_user_fields(
        self,
        objects: Sequence[Any],
        field_names: Sequence[str] = ("created_by", "updated_by"),
    ) -> None:
        """Resolve user UUID fields to usernames in-place.

        This is cosmetic enrichment — if the query fails, UUIDs are left
        in place so the caller's already-committed operation still succeeds.
        """
        user_ids: set[str | UUID] = set()
        for obj in objects:
            for field in field_names:
                val = getattr(obj, field, None)
                if val:
                    user_ids.add(val)
        if not user_ids:
            return
        try:
            stmt = select(User.id, User.username).where(User.id.in_(user_ids))  # type: ignore[attr-defined]
            result = await self.session.exec(stmt)
            user_map: dict[str | UUID, str] = {row[0]: row[1] for row in result}
        except (SQLAlchemyError, OSError):
            logger.warning("Failed to resolve usernames; returning UUIDs", exc_info=True)
            return
        unresolved = user_ids - set(user_map.keys())
        if unresolved:
            logger.debug(
                "Some user UUIDs could not be resolved to usernames", unresolved_ids=[str(uid) for uid in unresolved]
            )
        for obj in objects:
            for field in field_names:
                val = getattr(obj, field, None)
                if val and val in user_map:
                    setattr(obj, field, user_map[val])

    async def create_credential(self, data: CredentialCreate) -> CredentialRead:
        """Create a new credential with encrypted inputs via SecretService."""
        credential_type = await self._get_credential_type(data.credential_type_id)

        # Validate inputs against type schema (always validate — empty dict may miss required fields)
        _validate_inputs(data.inputs, credential_type.inputs)

        existing = await self._find_by_name(data.name)
        if existing:
            raise CredentialNameConflictError(data.name)

        # Store inputs via SecretService
        secret_id: UUID | None = None
        if data.inputs:
            secret_id = await self._secret_service.create_secret(data.inputs)

        credential = Credential(
            name=data.name,
            description=data.description,
            credential_type_id=data.credential_type_id,
            secret_id=secret_id,
            labels=data.labels,
            created_by=self.user.id,
            updated_by=self.user.id,
        )
        self.session.add(credential)
        await self.session.commit()
        await self.session.refresh(credential)

        logger.info("Credential created", credential_id=str(credential.id), name=credential.name)

        decrypted_inputs = data.inputs or {}
        read = self._build_masked_response(credential, credential_type, decrypted_inputs)
        await self._resolve_user_fields([read])
        return read

    async def get_credential(self, credential_id: UUID) -> CredentialRead:
        """Get a credential with secret fields masked, non-secret fields decrypted."""
        credential = await self._get_or_raise(credential_id)
        credential_type = await self._get_credential_type(credential.credential_type_id)

        decrypted_inputs = await self._retrieve_or_empty(credential.secret_id)
        read = self._build_masked_response(credential, credential_type, decrypted_inputs)

        counts = await self.get_workflow_counts([credential_id])
        read.workflow_count = counts.get(credential_id, 0)
        await self._resolve_user_fields([read])

        return read

    async def list_credentials(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> CredentialListResponse:
        """List credentials with metadata only (no decryption, no backend contact)."""
        response = await self.list_resources(
            Credential,
            CredentialListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort,
            query_params_items=query_params_items,
            include_total=include_total,
        )

        cred_ids = [r.id for r in response.resources]
        if cred_ids:
            workflow_counts = await self.get_workflow_counts(cred_ids)
            for resource in response.resources:
                resource.workflow_count = workflow_counts.get(resource.id, 0)

        await self._resolve_user_fields(response.resources)

        return response

    async def update_credential(self, credential_id: UUID, data: CredentialPatch) -> CredentialRead:
        """Update a credential. $encrypted$ preserves existing encrypted values."""
        credential = await self._get_or_raise(credential_id)
        credential_type = await self._get_credential_type(credential.credential_type_id)

        if data.name is not None and data.name != credential.name:
            existing = await self._find_by_name(data.name)
            if existing and existing.id != credential.id:
                raise CredentialNameConflictError(data.name)
            credential.name = data.name

        if data.description is not None:
            credential.description = data.description
        if data.enabled is not None:
            credential.enabled = data.enabled
        if data.labels is not None:
            credential.labels = data.labels

        # Validate inputs (allow $encrypted$ sentinel for PATCH preservation)
        if data.inputs is not None:
            _validate_inputs(data.inputs, credential_type.inputs, allow_sentinel=True)

        # Handle inputs update with $encrypted$ preservation via SecretService
        decrypted_inputs: dict[str, Any] = {}
        if data.inputs is not None:
            credential.secret_id, decrypted_inputs = await self._merge_and_store_inputs(credential, data.inputs)
        else:
            decrypted_inputs = await self._retrieve_or_empty(credential.secret_id)

        credential.updated_by = self.user.id
        self.session.add(credential)
        await self.session.commit()
        await self.session.refresh(credential)

        logger.info("Credential updated", credential_id=str(credential.id))
        read = self._build_masked_response(credential, credential_type, decrypted_inputs)

        counts = await self.get_workflow_counts([credential_id])
        read.workflow_count = counts.get(credential_id, 0)

        await self._resolve_user_fields([read])

        return read

    async def delete_credential(self, credential_id: UUID) -> None:
        """Soft-delete a credential and delete its secret data atomically."""
        credential = await self._get_or_raise(credential_id)
        secret_id = credential.secret_id

        # Atomic delete: all changes happen in SQLAlchemy's implicit transaction
        # (no commit() between steps). If any step fails, nothing is committed.
        #
        # Order matters for FK constraints:
        #   1. NULL credential.secret_id (removes credentials → secrets FK ref)
        #   2. delete_secret() removes EncryptedSecret then Secret rows
        #   3. commit() finalizes everything in one transaction
        credential.secret_id = None
        credential.deleted_at = datetime.now(UTC)
        credential.deleted_by = self.user.id
        self.session.add(credential)

        if secret_id:
            await self._secret_service.delete_secret(secret_id)

        await self.session.commit()
        logger.info("Credential deleted", credential_id=str(credential.id))

    async def get_credential_workflows(self, credential_id: UUID) -> list[CredentialWorkflowRef]:
        """Find workflows that reference a given credential in their definitions.

        Uses PostgreSQL jsonb_path_exists for precise matching of credentialId
        values in workflow definitions. Returns enriched workflow references
        including description, creator, node names, and latest execution info.

        Args:
            credential_id: UUID of the credential.

        Returns:
            List of enriched workflow references that use this credential.

        Raises:
            CredentialNotFoundError: If credential does not exist.

        """
        from nexus.workflows.models.execution import Execution  # noqa: PLC0415

        await self._get_or_raise(credential_id)

        rows = await self._query_workflows_by_credential_ids([credential_id])
        workflow_ids = [row[0] for row in rows]

        # Batch-fetch latest execution per workflow (enrichment — graceful on failure)
        exec_map: dict[UUID, tuple[datetime, str]] = {}
        if workflow_ids:
            try:
                latest_exec_stmt = (
                    select(
                        Execution.workflow_id,
                        Execution.created_at,
                        Execution.status,
                    )
                    .where(
                        Execution.workflow_id.in_(workflow_ids),  # type: ignore[attr-defined]
                        Execution.deleted_at.is_(None),  # type: ignore[union-attr]
                    )
                    .order_by(Execution.workflow_id, Execution.created_at.desc())  # type: ignore[arg-type, attr-defined]
                    .distinct(Execution.workflow_id)  # type: ignore[arg-type]
                )
                exec_result = await self.session.exec(latest_exec_stmt)
                for exec_row in exec_result.all():
                    exec_map[exec_row[0]] = (exec_row[1], exec_row[2])
            except (SQLAlchemyError, OSError):
                logger.warning(
                    "Failed to fetch execution info for credential workflows",
                    credential_id=str(credential_id),
                    workflow_count=len(workflow_ids),
                    exc_info=True,
                )

        cred_id_str = str(credential_id)
        refs = []
        for row in rows:
            try:
                node_names = _extract_credential_node_names(row[2], cred_id_str) if isinstance(row[2], dict) else []
            except (TypeError, AttributeError, KeyError):
                logger.warning(
                    "Failed to extract node names from workflow definition", workflow_id=str(row[0]), exc_info=True
                )
                node_names = []
            exec_info = exec_map.get(row[0])
            refs.append(
                CredentialWorkflowRef(
                    id=row[0],
                    name=row[1],
                    description=row[3],
                    created_by=row[4],
                    node_names=node_names,
                    last_execution_at=exec_info[0] if exec_info else None,
                    last_execution_status=exec_info[1] if exec_info else None,
                ),
            )

        # Resolve created_by UUIDs to usernames
        await self._resolve_user_fields(refs, field_names=("created_by",))

        return refs

    @staticmethod
    def _latest_workflow_versions_subquery() -> Any:  # noqa: ANN401
        """Subquery returning (workflow_id, max_version) for non-deleted workflow versions."""
        from nexus.workflows.models.workflow_version import WorkflowVersion  # noqa: PLC0415

        return (
            select(
                WorkflowVersion.workflow_id,
                func.max(WorkflowVersion.version).label("max_version"),
            )
            .where(WorkflowVersion.deleted_at.is_(None))  # type: ignore[union-attr]
            .group_by(WorkflowVersion.workflow_id)  # type: ignore[arg-type]
            .subquery()
        )

    async def get_workflow_counts(self, credential_ids: list[UUID]) -> dict[UUID, int]:
        """Count workflows referencing each credential in a single SQL query.

        Uses PostgreSQL jsonb_path_exists with SUM(CASE) to count per-credential
        in one query against the latest workflow versions.

        Args:
            credential_ids: List of credential UUIDs to count for.

        Returns:
            Dict mapping credential_id -> workflow count.

        """
        from nexus.workflows.models.workflow import Workflow  # noqa: PLC0415
        from nexus.workflows.models.workflow_version import WorkflowVersion  # noqa: PLC0415

        if not credential_ids:
            return {}

        latest_version = self._latest_workflow_versions_subquery()

        # Build SUM(CASE WHEN jsonb_path_exists(...) THEN 1 ELSE 0 END) per credential
        count_columns = [
            func.sum(
                case(
                    (
                        func.jsonb_path_exists(
                            WorkflowVersion.workflow_definition,
                            literal_column(f"'$.**.credentialId ? (@ == \"{cid}\")'::jsonpath"),
                        ),
                        1,
                    ),
                    else_=0,
                ),
            ).label(str(cid))
            for cid in credential_ids
        ]

        stmt = (
            select(*count_columns)
            .select_from(Workflow)
            .join(latest_version, Workflow.id == latest_version.c.workflow_id)
            .join(
                WorkflowVersion,
                (WorkflowVersion.workflow_id == latest_version.c.workflow_id)
                & (WorkflowVersion.version == latest_version.c.max_version),
            )
            .where(Workflow.deleted_at.is_(None))  # type: ignore[union-attr]
        )

        result = await self.session.exec(stmt)
        row = result.one_or_none()

        counts: dict[UUID, int] = dict.fromkeys(credential_ids, 0)
        if row:
            # SQLAlchemy returns a scalar for single-column SELECT, tuple for multiple
            values = (row,) if len(credential_ids) == 1 else row
            for i, cid in enumerate(credential_ids):
                counts[cid] = int(values[i] or 0)

        return counts

    async def _query_workflows_by_credential_ids(
        self,
        credential_ids: list[UUID],
    ) -> Sequence[Any]:
        """Query latest workflow definitions that reference any of the given credential IDs.

        Uses PostgreSQL jsonb_path_exists for precise JSON-level matching,
        avoiding false positives from substring matches on UUIDs.

        Args:
            credential_ids: Credential UUIDs to filter by.

        Returns:
            Sequence of (workflow_id, workflow_name, workflow_definition, description, created_by) rows.

        """
        from nexus.workflows.models.workflow import Workflow  # noqa: PLC0415
        from nexus.workflows.models.workflow_version import WorkflowVersion  # noqa: PLC0415

        latest_version = self._latest_workflow_versions_subquery()

        stmt = (
            select(  # type: ignore[call-overload]
                Workflow.id,
                Workflow.name,
                WorkflowVersion.workflow_definition,
                Workflow.description,
                Workflow.created_by,
            )
            .join(latest_version, Workflow.id == latest_version.c.workflow_id)
            .join(
                WorkflowVersion,
                (WorkflowVersion.workflow_id == latest_version.c.workflow_id)
                & (WorkflowVersion.version == latest_version.c.max_version),
            )
            .where(Workflow.deleted_at.is_(None))  # type: ignore[union-attr]
        )

        # Use jsonb_path_exists for precise credentialId matching (PostgreSQL 12+)
        # literal_column with ::jsonpath cast avoids asyncpg VARCHAR type mismatch
        jsonpath_conditions = [
            func.jsonb_path_exists(
                WorkflowVersion.workflow_definition,
                literal_column(f"'$.**.credentialId ? (@ == \"{cid}\")'::jsonpath"),
            )
            for cid in credential_ids
        ]
        stmt = stmt.where(or_(*jsonpath_conditions))

        result = await self.session.exec(stmt)
        return result.all()  # type: ignore[no-any-return]

    async def _merge_and_store_inputs(
        self, credential: Credential, new_inputs: dict[str, Any]
    ) -> tuple[UUID, dict[str, Any]]:
        """Merge new inputs with existing (preserving $encrypted$) and store via SecretService.

        Returns (secret_id, merged_plaintext) to avoid a redundant retrieve for the response.
        """
        existing_inputs = await self._retrieve_or_empty(credential.secret_id)

        # Merge: keep existing for $encrypted$, use new for changed fields
        updated_inputs = {
            **existing_inputs,
            **{k: v for k, v in new_inputs.items() if v != ENCRYPTED_SENTINEL},
        }

        if credential.secret_id:
            await self._secret_service.update_secret(credential.secret_id, updated_inputs)
            return credential.secret_id, updated_inputs
        secret_id = await self._secret_service.create_secret(updated_inputs)
        return secret_id, updated_inputs

    async def _get_or_raise(self, credential_id: UUID) -> Credential:
        """Get credential by ID or raise CredentialNotFoundError."""
        query = select(Credential).where(
            Credential.id == credential_id,
            Credential.deleted_at.is_(None),  # type: ignore[union-attr]
        )
        result = await self.session.exec(query)
        credential = result.one_or_none()
        if not credential:
            msg = f"Credential with ID '{credential_id}' not found"
            raise CredentialNotFoundError(msg)
        return credential

    async def _retrieve_or_empty(self, secret_id: UUID | None) -> dict[str, Any]:
        """Retrieve decrypted inputs or return empty dict. Wraps EncryptionError."""
        if not secret_id:
            return {}
        try:
            return await self._secret_service.retrieve_secret(secret_id)
        except EncryptionError as e:
            msg = "Failed to decrypt credential data"
            raise CredentialDecryptionError(msg) from e

    async def _find_by_name(self, name: str) -> Credential | None:
        """Find a non-deleted credential by name."""
        stmt = select(Credential).where(
            Credential.name == name,
            Credential.deleted_at.is_(None),  # type: ignore[union-attr]
        )
        result = await self.session.exec(stmt)
        return result.first()
