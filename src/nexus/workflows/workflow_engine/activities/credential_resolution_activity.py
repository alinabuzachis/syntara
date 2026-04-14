"""Temporal activity for resolving workflow credentials at execution time.

Resolves Nexus credentials from the database, decrypts field values,
and produces structured configuration (extra_vars, env, file) via
InjectorResolver for consumption by activity executors.
"""

from typing import Any

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from temporalio import activity
from temporalio.exceptions import ApplicationError

from nexus.core.database.session import AsyncSessionLocal
from nexus.core.lib.encryption import EncryptionError
from nexus.core.services.secret_service import SecretService, create_secret_service
from nexus.credentials.lib.injector_resolver import InjectorResolver
from nexus.credentials.models.credential import Credential
from nexus.credentials.models.credential_type import CredentialType

logger = structlog.stdlib.get_logger(__name__)

# Module-level session factory — defaults to production AsyncSessionLocal.
# Tests can override this to use a test database session factory.
_session_factory = AsyncSessionLocal


@activity.defn(name="resolve_workflow_credentials")
async def resolve_workflow_credentials(credential_map: dict[str, str]) -> dict[str, Any]:
    """Resolve credentials for workflow activities.

    For each {activity_id: credential_id} entry, fetches the credential,
    decrypts its inputs, and resolves injector templates.

    Args:
        credential_map: Mapping of activity_id -> credential_id (UUID strings).

    Returns:
        Dict mapping activity_id -> resolved credential data containing
        credential_id, credential_type_name, extra_vars, env, file.

    Raises:
        ApplicationError: Non-retryable error if credential is missing, disabled,
            deleted, or decryption fails.

    """
    results: dict[str, Any] = {}

    try:
        async with _session_factory() as session:
            secret_service = create_secret_service(session)

            for activity_id, credential_id in credential_map.items():
                resolved = await _resolve_single_credential(session, secret_service, activity_id, credential_id)
                results[activity_id] = resolved
    except ApplicationError:
        raise
    except Exception as e:
        msg = f"Database error during credential resolution: {type(e).__name__}"
        raise ApplicationError(msg, non_retryable=True) from e

    return results


async def _resolve_single_credential(
    session: AsyncSession,
    secret_service: SecretService,
    activity_id: str,
    credential_id: str,
) -> dict[str, Any]:
    """Resolve a single credential for an activity.

    Args:
        session: Async database session.
        secret_service: SecretService for decryption.
        activity_id: The activity requesting the credential.
        credential_id: UUID string of the credential to resolve.

    Returns:
        Dict with credential_id, credential_type_name, extra_vars, env, file.

    Raises:
        ApplicationError: Non-retryable if credential is missing, disabled, or decryption fails.

    """
    stmt = select(Credential).where(
        Credential.id == credential_id,
        Credential.deleted_at.is_(None),  # type: ignore[union-attr]
    )
    result = await session.exec(stmt)
    credential = result.one_or_none()

    if not credential:
        msg = f"Credential '{credential_id}' not found or deleted"
        raise ApplicationError(msg, non_retryable=True)

    if not credential.enabled:
        msg = f"Credential '{credential.name}' is disabled. Re-enable it before running workflows."
        raise ApplicationError(msg, non_retryable=True)

    if not credential.secret_id:
        msg = f"Credential '{credential.name}' has no stored secret data"
        raise ApplicationError(msg, non_retryable=True)

    try:
        decrypted_inputs = await secret_service.retrieve_secret(credential.secret_id)
    except EncryptionError as e:
        msg = f"Failed to decrypt credential '{credential.name}'"
        raise ApplicationError(msg, non_retryable=True) from e

    cred_type = await session.get(CredentialType, credential.credential_type_id)
    if not cred_type:
        msg = f"Credential type for credential '{credential.name}' not found"
        raise ApplicationError(msg, non_retryable=True)

    try:
        resolved_injectors = InjectorResolver.resolve(cred_type.injectors, decrypted_inputs)
    except Exception as e:
        msg = f"Failed to resolve injector templates for credential '{credential.name}'"
        raise ApplicationError(msg, non_retryable=True) from e

    logger.info(
        "Credential resolved",
        credential_id=credential_id,
        activity_id=activity_id,
        type_name=cred_type.name,
    )

    return {
        "credential_id": credential_id,
        "credential_type_name": cred_type.name,
        "extra_vars": resolved_injectors.extra_vars,
        "env": resolved_injectors.env,
        "file": resolved_injectors.file,
    }
