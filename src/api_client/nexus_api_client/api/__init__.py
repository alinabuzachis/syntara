"""Nexus API Registry - auto-generated from OpenAPI spec."""

from __future__ import annotations

from functools import cached_property

from ..client import AuthenticatedClient, Client
from .approvals import ApprovalsApi
from .default import DefaultApi
from .executions import ExecutionsApi
from .files import FilesApi
from .invocation import InvocationApi
from .tool_manager import ToolManagerApi
from .workflows import WorkflowsApi


class NexusApiRegistry:
    """Top-level registry providing access to all API endpoint groups."""

    def __init__(self, client: Client | AuthenticatedClient) -> None:
        self._client = client

    @cached_property
    def approvals(self) -> ApprovalsApi:
        return ApprovalsApi(client=self._client)

    @cached_property
    def default(self) -> DefaultApi:
        return DefaultApi(client=self._client)

    @cached_property
    def files(self) -> FilesApi:
        return FilesApi(client=self._client)

    @cached_property
    def invocation(self) -> InvocationApi:
        return InvocationApi(client=self._client)

    @cached_property
    def tool_manager(self) -> ToolManagerApi:
        return ToolManagerApi(client=self._client)

    @cached_property
    def executions(self) -> ExecutionsApi:
        return ExecutionsApi(client=self._client)

    @cached_property
    def workflows(self) -> WorkflowsApi:
        return WorkflowsApi(client=self._client)
