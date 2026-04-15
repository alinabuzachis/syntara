"""Settings REST API endpoints."""

import re
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit import EventCategory, track_event
from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NexusRouter
from nexus.settings.models.api_models import (
    CategoriesListResponse,
    RuntimeSettingRead,
    SettingBulkUpdateRequest,
    SettingsListResponse,
    SettingUpdate,
)
from nexus.settings.models.query_params import SettingsListParams
from nexus.settings.services.settings_service import SettingsService

router = NexusRouter(prefix="/settings", tags=["settings"])


# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_settings_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> SettingsService:
    """Dependency provider for SettingsService."""
    return SettingsService(db, current_user)


_require_settings_read = PermissionChecker("setting", "read", roles=["admin"])
_require_settings_write = PermissionChecker("setting", "write", roles=["admin"])


_SETTING_KEY_PATTERN = re.compile(r"^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)+$")


def _validate_key(key: str) -> None:
    """Validate that a setting key matches the dot-namespaced format."""
    if not _SETTING_KEY_PATTERN.match(key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid setting key format: '{key}'",
        )


# ============================================================================
# Endpoints
# ============================================================================


@router.get("", dependencies=[Depends(_require_settings_read)])
async def list_settings(
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
    params: Annotated[SettingsListParams, Depends()],
) -> SettingsListResponse:
    """List all runtime settings with pagination, filtering, and sorting."""
    return await service.list_settings(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get("/categories", dependencies=[Depends(_require_settings_read)])
async def list_categories(
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> CategoriesListResponse:
    """List all setting categories with their group names."""
    return await service.list_categories()


@router.get("/{key}", dependencies=[Depends(_require_settings_read)])
async def get_setting(
    key: str,
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> RuntimeSettingRead:
    """Get a single runtime setting by its dot-namespaced key."""
    _validate_key(key)
    return await service.get(key)


@router.patch("/{key}", dependencies=[Depends(_require_settings_write)])
@track_event(
    EventCategory.USER_ACTION,
    capture_args={"key"},
    capture_result={"key", "value", "version"},
    actor_param="_current_user",
)
async def update_setting(
    key: str,
    body: SettingUpdate,
    _current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> RuntimeSettingRead:
    """Update a runtime setting value with optimistic locking."""
    _validate_key(key)
    return await service.update(
        key=key,
        value=body.value,
        expected_version=body.expected_version,
    )


@router.patch("", dependencies=[Depends(_require_settings_write)])
@track_event(EventCategory.USER_ACTION, capture_args={"body"}, actor_param="_current_user")
async def bulk_update_settings(
    body: SettingBulkUpdateRequest,
    _current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> list[RuntimeSettingRead]:
    """Update multiple settings in a single request."""
    seen_keys: set[str] = set()
    for item in body.updates:
        _validate_key(item.key)
        if item.key in seen_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate key in bulk update: '{item.key}'",
            )
        seen_keys.add(item.key)
    return await service.bulk_update(body.updates)
