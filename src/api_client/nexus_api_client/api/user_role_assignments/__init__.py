"""user_role_assignments API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import assign_user_role, list_user_role_assignments, revoke_user_role_assignment


class UserRoleAssignmentsApi:
    """Registry for user_role_assignments API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_user_role_assignments.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_user_role_assignments.asyncio_detailed(client=self._client, **kwargs)

    def assign_user_role(self, **kwargs: Any) -> Response[Any]:
        return assign_user_role.sync_detailed(client=self._client, **kwargs)

    async def async_assign_user_role(self, **kwargs: Any) -> Response[Any]:
        return await assign_user_role.asyncio_detailed(client=self._client, **kwargs)

    def revoke(self, **kwargs: Any) -> Response[Any]:
        return revoke_user_role_assignment.sync_detailed(client=self._client, **kwargs)

    async def async_revoke(self, **kwargs: Any) -> Response[Any]:
        return await revoke_user_role_assignment.asyncio_detailed(client=self._client, **kwargs)
