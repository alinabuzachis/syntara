"""Nexus API Registry - auto-generated from OpenAPI spec."""

from __future__ import annotations

from functools import cached_property

from ..client import AuthenticatedClient
from .aap import AapApi
from .approvals import ApprovalsApi
from .audit_events import AuditEventsApi
from .authentication import AuthenticationApi
from .authorization import AuthorizationApi
from .credentials import CredentialsApi
from .example import ExampleApi
from .executions import ExecutionsApi
from .files import FilesApi
from .groups import GroupsApi
from .identity_providers import IdentityProvidersApi
from .internal_metrics import InternalMetricsApi
from .invocation import InvocationApi
from .policies import PoliciesApi
from .projects import ProjectsApi
from .role_assignments import RoleAssignmentsApi
from .roles import RolesApi
from .settings import SettingsApi
from .tool_manager import ToolManagerApi
from .tool_metrics import ToolMetricsApi
from .users import UsersApi
from .workflows import WorkflowsApi


class NexusApiRegistry:
    """Top-level registry providing access to all API endpoint groups."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    @cached_property
    def aap(self) -> AapApi:
        return AapApi(client=self._client)

    @cached_property
    def approvals(self) -> ApprovalsApi:
        return ApprovalsApi(client=self._client)

    @cached_property
    def audit_events(self) -> AuditEventsApi:
        return AuditEventsApi(client=self._client)

    @cached_property
    def authentication(self) -> AuthenticationApi:
        return AuthenticationApi(client=self._client)

    @cached_property
    def authorization(self) -> AuthorizationApi:
        return AuthorizationApi(client=self._client)

    @cached_property
    def policies(self) -> PoliciesApi:
        return PoliciesApi(client=self._client)

    @cached_property
    def roles(self) -> RolesApi:
        return RolesApi(client=self._client)

    @cached_property
    def role_assignments(self) -> RoleAssignmentsApi:
        return RoleAssignmentsApi(client=self._client)

    @cached_property
    def credentials(self) -> CredentialsApi:
        return CredentialsApi(client=self._client)

    @cached_property
    def example(self) -> ExampleApi:
        return ExampleApi(client=self._client)

    @cached_property
    def files(self) -> FilesApi:
        return FilesApi(client=self._client)

    @cached_property
    def identity_providers(self) -> IdentityProvidersApi:
        return IdentityProvidersApi(client=self._client)

    @cached_property
    def internal_metrics(self) -> InternalMetricsApi:
        return InternalMetricsApi(client=self._client)

    @cached_property
    def invocation(self) -> InvocationApi:
        return InvocationApi(client=self._client)

    @cached_property
    def projects(self) -> ProjectsApi:
        return ProjectsApi(client=self._client)

    @cached_property
    def settings(self) -> SettingsApi:
        return SettingsApi(client=self._client)

    @cached_property
    def tool_metrics(self) -> ToolMetricsApi:
        return ToolMetricsApi(client=self._client)

    @cached_property
    def tool_manager(self) -> ToolManagerApi:
        return ToolManagerApi(client=self._client)

    @cached_property
    def users(self) -> UsersApi:
        return UsersApi(client=self._client)

    @cached_property
    def groups(self) -> GroupsApi:
        return GroupsApi(client=self._client)

    @cached_property
    def executions(self) -> ExecutionsApi:
        return ExecutionsApi(client=self._client)

    @cached_property
    def workflows(self) -> WorkflowsApi:
        return WorkflowsApi(client=self._client)
