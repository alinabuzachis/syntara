"""aap API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import (
    get_aap_job_template,
    get_aap_workflow_job_template,
    list_aap_credentials,
    list_aap_execution_environments,
    list_aap_instance_groups,
    list_aap_inventories,
    list_aap_job_templates,
    list_aap_labels,
    list_aap_organizations,
    list_aap_workflow_job_templates,
)


class AapApi:
    """Registry for aap API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list_organizations(self, **kwargs: Any) -> Response[Any]:
        return list_aap_organizations.sync_detailed(client=self._client, **kwargs)

    async def async_list_organizations(self, **kwargs: Any) -> Response[Any]:
        return await list_aap_organizations.asyncio_detailed(client=self._client, **kwargs)

    def list_job_templates(self, **kwargs: Any) -> Response[Any]:
        return list_aap_job_templates.sync_detailed(client=self._client, **kwargs)

    async def async_list_job_templates(self, **kwargs: Any) -> Response[Any]:
        return await list_aap_job_templates.asyncio_detailed(client=self._client, **kwargs)

    def get_job_template(self, **kwargs: Any) -> Response[Any]:
        return get_aap_job_template.sync_detailed(client=self._client, **kwargs)

    async def async_get_job_template(self, **kwargs: Any) -> Response[Any]:
        return await get_aap_job_template.asyncio_detailed(client=self._client, **kwargs)

    def list_workflow_job_templates(self, **kwargs: Any) -> Response[Any]:
        return list_aap_workflow_job_templates.sync_detailed(client=self._client, **kwargs)

    async def async_list_workflow_job_templates(self, **kwargs: Any) -> Response[Any]:
        return await list_aap_workflow_job_templates.asyncio_detailed(client=self._client, **kwargs)

    def get_workflow_job_template(self, **kwargs: Any) -> Response[Any]:
        return get_aap_workflow_job_template.sync_detailed(client=self._client, **kwargs)

    async def async_get_workflow_job_template(self, **kwargs: Any) -> Response[Any]:
        return await get_aap_workflow_job_template.asyncio_detailed(client=self._client, **kwargs)

    def list_inventories(self, **kwargs: Any) -> Response[Any]:
        return list_aap_inventories.sync_detailed(client=self._client, **kwargs)

    async def async_list_inventories(self, **kwargs: Any) -> Response[Any]:
        return await list_aap_inventories.asyncio_detailed(client=self._client, **kwargs)

    def list_execution_environments(self, **kwargs: Any) -> Response[Any]:
        return list_aap_execution_environments.sync_detailed(client=self._client, **kwargs)

    async def async_list_execution_environments(self, **kwargs: Any) -> Response[Any]:
        return await list_aap_execution_environments.asyncio_detailed(client=self._client, **kwargs)

    def list_credentials(self, **kwargs: Any) -> Response[Any]:
        return list_aap_credentials.sync_detailed(client=self._client, **kwargs)

    async def async_list_credentials(self, **kwargs: Any) -> Response[Any]:
        return await list_aap_credentials.asyncio_detailed(client=self._client, **kwargs)

    def list_instance_groups(self, **kwargs: Any) -> Response[Any]:
        return list_aap_instance_groups.sync_detailed(client=self._client, **kwargs)

    async def async_list_instance_groups(self, **kwargs: Any) -> Response[Any]:
        return await list_aap_instance_groups.asyncio_detailed(client=self._client, **kwargs)

    def list_labels(self, **kwargs: Any) -> Response[Any]:
        return list_aap_labels.sync_detailed(client=self._client, **kwargs)

    async def async_list_labels(self, **kwargs: Any) -> Response[Any]:
        return await list_aap_labels.asyncio_detailed(client=self._client, **kwargs)
