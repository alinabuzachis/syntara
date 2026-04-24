"""Nexus API Registry - auto-generated from OpenAPI spec."""

from __future__ import annotations

from functools import cached_property

from ..client import AuthenticatedClient
from .aap import AapApi
from .all_role_assignments import AllRoleAssignmentsApi
from .approvals import ApprovalsApi
from .audit_events import AuditEventsApi
from .authentication import AuthenticationApi
from .authorization import AuthorizationApi
from .credentials import CredentialsApi
from .example import ExampleApi
from .executions import ExecutionsApi
from .files import FilesApi
from .group_role_assignments import GroupRoleAssignmentsApi
from .groups import GroupsApi
from .identity_providers import IdentityProvidersApi
from .invocation import InvocationApi
from .policies import PoliciesApi
from .projects import ProjectsApi
from .roles import RolesApi
from .settings import SettingsApi
from .tool_manager import ToolManagerApi
from .tool_metrics import ToolMetricsApi
from .user_role_assignments import UserRoleAssignmentsApi
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
    def all_role_assignments(self) -> AllRoleAssignmentsApi:
        return AllRoleAssignmentsApi(client=self._client)

    @cached_property
    def group_role_assignments(self) -> GroupRoleAssignmentsApi:
        return GroupRoleAssignmentsApi(client=self._client)

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
    def user_role_assignments(self) -> UserRoleAssignmentsApi:
        return UserRoleAssignmentsApi(client=self._client)

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
