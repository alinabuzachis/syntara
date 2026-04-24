"""projects API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import (
    create_project,
    create_project_policy,
    create_project_role,
    create_project_role_assignment,
    delete_project,
    delete_project_policy,
    delete_project_role,
    delete_project_role_assignment,
    get_project,
    get_project_policy,
    get_project_role,
    list_project_approvals,
    list_project_role_assignments,
    list_project_workflows,
    list_projects,
    replace_project,
    replace_project_policy,
    replace_project_role,
    update_project,
    update_project_policy,
    update_project_role,
)


class ProjectsApi:
    """Registry for projects API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_projects.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_projects.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_project.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_project.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_project.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_project.asyncio_detailed(client=self._client, **kwargs)

    def replace(self, **kwargs: Any) -> Response[Any]:
        return replace_project.sync_detailed(client=self._client, **kwargs)

    async def async_replace(self, **kwargs: Any) -> Response[Any]:
        return await replace_project.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        return delete_project.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        return await delete_project.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        return update_project.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        return await update_project.asyncio_detailed(client=self._client, **kwargs)

    def list_workflows(self, **kwargs: Any) -> Response[Any]:
        return list_project_workflows.sync_detailed(client=self._client, **kwargs)

    async def async_list_workflows(self, **kwargs: Any) -> Response[Any]:
        return await list_project_workflows.asyncio_detailed(client=self._client, **kwargs)

    def list_approvals(self, **kwargs: Any) -> Response[Any]:
        return list_project_approvals.sync_detailed(client=self._client, **kwargs)

    async def async_list_approvals(self, **kwargs: Any) -> Response[Any]:
        return await list_project_approvals.asyncio_detailed(client=self._client, **kwargs)

    def list_role_assignments(self, **kwargs: Any) -> Response[Any]:
        return list_project_role_assignments.sync_detailed(client=self._client, **kwargs)

    async def async_list_role_assignments(self, **kwargs: Any) -> Response[Any]:
        return await list_project_role_assignments.asyncio_detailed(client=self._client, **kwargs)

    def create_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return create_project_role_assignment.sync_detailed(client=self._client, **kwargs)

    async def async_create_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return await create_project_role_assignment.asyncio_detailed(client=self._client, **kwargs)

    def delete_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return delete_project_role_assignment.sync_detailed(client=self._client, **kwargs)

    async def async_delete_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return await delete_project_role_assignment.asyncio_detailed(client=self._client, **kwargs)

    def create_role(self, **kwargs: Any) -> Response[Any]:
        return create_project_role.sync_detailed(client=self._client, **kwargs)

    async def async_create_role(self, **kwargs: Any) -> Response[Any]:
        return await create_project_role.asyncio_detailed(client=self._client, **kwargs)

    def get_role(self, **kwargs: Any) -> Response[Any]:
        return get_project_role.sync_detailed(client=self._client, **kwargs)

    async def async_get_role(self, **kwargs: Any) -> Response[Any]:
        return await get_project_role.asyncio_detailed(client=self._client, **kwargs)

    def replace_role(self, **kwargs: Any) -> Response[Any]:
        return replace_project_role.sync_detailed(client=self._client, **kwargs)

    async def async_replace_role(self, **kwargs: Any) -> Response[Any]:
        return await replace_project_role.asyncio_detailed(client=self._client, **kwargs)

    def delete_role(self, **kwargs: Any) -> Response[Any]:
        return delete_project_role.sync_detailed(client=self._client, **kwargs)

    async def async_delete_role(self, **kwargs: Any) -> Response[Any]:
        return await delete_project_role.asyncio_detailed(client=self._client, **kwargs)

    def update_role(self, **kwargs: Any) -> Response[Any]:
        return update_project_role.sync_detailed(client=self._client, **kwargs)

    async def async_update_role(self, **kwargs: Any) -> Response[Any]:
        return await update_project_role.asyncio_detailed(client=self._client, **kwargs)

    def create_policy(self, **kwargs: Any) -> Response[Any]:
        return create_project_policy.sync_detailed(client=self._client, **kwargs)

    async def async_create_policy(self, **kwargs: Any) -> Response[Any]:
        return await create_project_policy.asyncio_detailed(client=self._client, **kwargs)

    def get_policy(self, **kwargs: Any) -> Response[Any]:
        return get_project_policy.sync_detailed(client=self._client, **kwargs)

    async def async_get_policy(self, **kwargs: Any) -> Response[Any]:
        return await get_project_policy.asyncio_detailed(client=self._client, **kwargs)

    def replace_policy(self, **kwargs: Any) -> Response[Any]:
        return replace_project_policy.sync_detailed(client=self._client, **kwargs)

    async def async_replace_policy(self, **kwargs: Any) -> Response[Any]:
        return await replace_project_policy.asyncio_detailed(client=self._client, **kwargs)

    def delete_policy(self, **kwargs: Any) -> Response[Any]:
        return delete_project_policy.sync_detailed(client=self._client, **kwargs)

    async def async_delete_policy(self, **kwargs: Any) -> Response[Any]:
        return await delete_project_policy.asyncio_detailed(client=self._client, **kwargs)

    def update_policy(self, **kwargs: Any) -> Response[Any]:
        return update_project_policy.sync_detailed(client=self._client, **kwargs)

    async def async_update_policy(self, **kwargs: Any) -> Response[Any]:
        return await update_project_policy.asyncio_detailed(client=self._client, **kwargs)
