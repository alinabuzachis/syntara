"""Nexus API Registry - auto-generated from OpenAPI spec."""

from __future__ import annotations

from functools import cached_property
from typing import TYPE_CHECKING

from ..client import AuthenticatedClient

if TYPE_CHECKING:
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
    from .groups_directory import GroupsDirectoryApi
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
    from .users_directory import UsersDirectoryApi
    from .webhooks import WebhooksApi
    from .workflows import WorkflowsApi


class NexusApiRegistry:
    """Top-level registry providing access to all API endpoint groups."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    @cached_property
    def aap(self) -> AapApi:
        from .aap import AapApi

        return AapApi(client=self._client)

    @cached_property
    def approvals(self) -> ApprovalsApi:
        from .approvals import ApprovalsApi

        return ApprovalsApi(client=self._client)

    @cached_property
    def audit_events(self) -> AuditEventsApi:
        from .audit_events import AuditEventsApi

        return AuditEventsApi(client=self._client)

    @cached_property
    def authentication(self) -> AuthenticationApi:
        from .authentication import AuthenticationApi

        return AuthenticationApi(client=self._client)

    @cached_property
    def authorization(self) -> AuthorizationApi:
        from .authorization import AuthorizationApi

        return AuthorizationApi(client=self._client)

    @cached_property
    def policies(self) -> PoliciesApi:
        from .policies import PoliciesApi

        return PoliciesApi(client=self._client)

    @cached_property
    def roles(self) -> RolesApi:
        from .roles import RolesApi

        return RolesApi(client=self._client)

    @cached_property
    def role_assignments(self) -> RoleAssignmentsApi:
        from .role_assignments import RoleAssignmentsApi

        return RoleAssignmentsApi(client=self._client)

    @cached_property
    def credentials(self) -> CredentialsApi:
        from .credentials import CredentialsApi

        return CredentialsApi(client=self._client)

    @cached_property
    def example(self) -> ExampleApi:
        from .example import ExampleApi

        return ExampleApi(client=self._client)

    @cached_property
    def files(self) -> FilesApi:
        from .files import FilesApi

        return FilesApi(client=self._client)

    @cached_property
    def identity_providers(self) -> IdentityProvidersApi:
        from .identity_providers import IdentityProvidersApi

        return IdentityProvidersApi(client=self._client)

    @cached_property
    def internal_metrics(self) -> InternalMetricsApi:
        from .internal_metrics import InternalMetricsApi

        return InternalMetricsApi(client=self._client)

    @cached_property
    def invocation(self) -> InvocationApi:
        from .invocation import InvocationApi

        return InvocationApi(client=self._client)

    @cached_property
    def projects(self) -> ProjectsApi:
        from .projects import ProjectsApi

        return ProjectsApi(client=self._client)

    @cached_property
    def settings(self) -> SettingsApi:
        from .settings import SettingsApi

        return SettingsApi(client=self._client)

    @cached_property
    def tool_metrics(self) -> ToolMetricsApi:
        from .tool_metrics import ToolMetricsApi

        return ToolMetricsApi(client=self._client)

    @cached_property
    def tool_manager(self) -> ToolManagerApi:
        from .tool_manager import ToolManagerApi

        return ToolManagerApi(client=self._client)

    @cached_property
    def users(self) -> UsersApi:
        from .users import UsersApi

        return UsersApi(client=self._client)

    @cached_property
    def users_directory(self) -> UsersDirectoryApi:
        from .users_directory import UsersDirectoryApi

        return UsersDirectoryApi(client=self._client)

    @cached_property
    def groups_directory(self) -> GroupsDirectoryApi:
        from .groups_directory import GroupsDirectoryApi

        return GroupsDirectoryApi(client=self._client)

    @cached_property
    def groups(self) -> GroupsApi:
        from .groups import GroupsApi

        return GroupsApi(client=self._client)

    @cached_property
    def executions(self) -> ExecutionsApi:
        from .executions import ExecutionsApi

        return ExecutionsApi(client=self._client)

    @cached_property
    def workflows(self) -> WorkflowsApi:
        from .workflows import WorkflowsApi

        return WorkflowsApi(client=self._client)

    @cached_property
    def webhooks(self) -> WebhooksApi:
        from .webhooks import WebhooksApi

        return WebhooksApi(client=self._client)
