"""AAP proxy router — auto-discovered under /api/v1/aap.

Thin layer that validates query params, resolves dependencies,
and delegates to AAPProxyService.

Authentication: Endpoints support optional per-user credential forwarding
via the ``credential_id`` query parameter. If provided, the specified Nexus
credential (type: "Ansible Automation Platform") is decrypted and used to
authenticate against the AAP Controller. If not provided, falls back to
environment variables (APP_AAP_TOKEN or APP_AAP_USERNAME/PASSWORD).

Authorization: The ``current_user`` dependency ensures only authenticated
Nexus users can call these endpoints. When using credential_id, users can
only use credentials they own (authorization check enforced).
"""

from collections.abc import AsyncGenerator
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Path
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.aap.models.queries import AAPBaseQuery, AAPResourceQuery
from nexus.aap.models.responses import (
    AAPCredential,
    AAPExecutionEnvironment,
    AAPInstanceGroup,
    AAPInventory,
    AAPJobTemplate,
    AAPJobTemplateDetail,
    AAPLabel,
    AAPListResponse,
    AAPOrganization,
)
from nexus.aap.services.aap_proxy_service import AAPProxyService
from nexus.auth import get_current_user
from nexus.core.config.base import Settings, get_settings
from nexus.core.database.session import get_db
from nexus.core.models import User

logger = structlog.stdlib.get_logger(__name__)

router = APIRouter(prefix="/aap", tags=["aap"])


# ============================================================================
# Dependency Injection
# ============================================================================


async def _get_aap_proxy_service(
    settings: Annotated[Settings, Depends(get_settings)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AsyncGenerator[AAPProxyService]:
    """Provide AAPProxyService with settings and db session wired; close client after request."""
    service = AAPProxyService(settings, db)
    try:
        yield service
    finally:
        await service.close()


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/organizations", operation_id="list_aap_organizations")
async def list_organizations(
    query: Annotated[AAPBaseQuery, Depends()],
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AAPProxyService, Depends(_get_aap_proxy_service)],
) -> AAPListResponse[AAPOrganization]:
    """List AAP organizations."""
    return await service.list_organizations(query, user_id=current_user.id)


@router.get("/job-templates", operation_id="list_aap_job_templates")
async def list_job_templates(
    query: Annotated[AAPResourceQuery, Depends()],
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AAPProxyService, Depends(_get_aap_proxy_service)],
) -> AAPListResponse[AAPJobTemplate]:
    """List AAP job templates, optionally filtered by organization."""
    return await service.list_job_templates(query, user_id=current_user.id)


@router.get("/job-templates/{job_template_id}", operation_id="get_aap_job_template")
async def get_job_template(
    job_template_id: Annotated[int, Path(ge=1)],
    query: Annotated[AAPBaseQuery, Depends()],
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AAPProxyService, Depends(_get_aap_proxy_service)],
) -> AAPJobTemplateDetail:
    """Get AAP job template details including prompt-on-launch capabilities."""
    # Convert UUID to string for service layer (accepts UUID | str, returns str | None)
    credential_id_str = str(query.credential_id) if query.credential_id else None
    return await service.get_job_template(job_template_id, credential_id=credential_id_str, user_id=current_user.id)


@router.get("/inventories", operation_id="list_aap_inventories")
async def list_inventories(
    query: Annotated[AAPResourceQuery, Depends()],
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AAPProxyService, Depends(_get_aap_proxy_service)],
) -> AAPListResponse[AAPInventory]:
    """List AAP inventories, optionally filtered by organization."""
    return await service.list_inventories(query, user_id=current_user.id)


@router.get("/execution-environments", operation_id="list_aap_execution_environments")
async def list_execution_environments(
    query: Annotated[AAPResourceQuery, Depends()],
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AAPProxyService, Depends(_get_aap_proxy_service)],
) -> AAPListResponse[AAPExecutionEnvironment]:
    """List AAP execution environments, optionally filtered by organization."""
    return await service.list_execution_environments(query, user_id=current_user.id)


@router.get("/credentials", operation_id="list_aap_credentials")
async def list_credentials(
    query: Annotated[AAPBaseQuery, Depends()],
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AAPProxyService, Depends(_get_aap_proxy_service)],
) -> AAPListResponse[AAPCredential]:
    """List AAP credentials (not organization-scoped)."""
    return await service.list_credentials(query, user_id=current_user.id)


@router.get("/instance-groups", operation_id="list_aap_instance_groups")
async def list_instance_groups(
    query: Annotated[AAPBaseQuery, Depends()],
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AAPProxyService, Depends(_get_aap_proxy_service)],
) -> AAPListResponse[AAPInstanceGroup]:
    """List AAP instance groups (not organization-scoped)."""
    return await service.list_instance_groups(query, user_id=current_user.id)


@router.get("/labels", operation_id="list_aap_labels")
async def list_labels(
    query: Annotated[AAPBaseQuery, Depends()],
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AAPProxyService, Depends(_get_aap_proxy_service)],
) -> AAPListResponse[AAPLabel]:
    """List AAP labels."""
    return await service.list_labels(query, user_id=current_user.id)
