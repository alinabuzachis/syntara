"""all_role_assignments API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import list_all_role_assignments


class AllRoleAssignmentsApi:
    """Registry for all_role_assignments API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_all_role_assignments.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_all_role_assignments.asyncio_detailed(client=self._client, **kwargs)
