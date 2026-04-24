"""group_role_assignments API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import assign_group_role, list_group_role_assignments, revoke_group_role_assignment


class GroupRoleAssignmentsApi:
    """Registry for group_role_assignments API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_group_role_assignments.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_group_role_assignments.asyncio_detailed(client=self._client, **kwargs)

    def assign_group_role(self, **kwargs: Any) -> Response[Any]:
        return assign_group_role.sync_detailed(client=self._client, **kwargs)

    async def async_assign_group_role(self, **kwargs: Any) -> Response[Any]:
        return await assign_group_role.asyncio_detailed(client=self._client, **kwargs)

    def revoke(self, **kwargs: Any) -> Response[Any]:
        return revoke_group_role_assignment.sync_detailed(client=self._client, **kwargs)

    async def async_revoke(self, **kwargs: Any) -> Response[Any]:
        return await revoke_group_role_assignment.asyncio_detailed(client=self._client, **kwargs)
