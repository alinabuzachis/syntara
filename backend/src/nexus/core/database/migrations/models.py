"""Application database models."""

from __future__ import annotations

from nexus.agent_orchestrator.models.invocation import Invocation
from nexus.agent_orchestrator.token_manager.models import TokenUsageRecord, UserTokenConfig
from nexus.approvals.models.approval_request import ApprovalRequest
from nexus.audit.outbox.models import AuditOutboxRecord, AuditTableMetadata
from nexus.auth.models.global_revocation_timestamp import GlobalRevocationTimestamp
from nexus.auth.session.models import RefreshSession
from nexus.authz.models import (
    Policy,
    Project,
    Role,
    RoleAssignment,
)
from nexus.core.models import User
from nexus.core.models.group import Group
from nexus.core.models.installation import Installation
from nexus.core.models.principal import Principal
from nexus.core.models.secret import EncryptedSecret, Secret
from nexus.credentials.models.credential import Credential
from nexus.credentials.models.credential_type import CredentialType
from nexus.files.models import FileMetadata
from nexus.identity_providers.models.identity_provider import IdentityProvider
from nexus.identity_providers.models.idp_group_mapping import IdpGroupMappingEntry
from nexus.integrations.models.integration import Integration, IntegrationProjectAssignment
from nexus.service_accounts.models.service_account import ServiceAccount
from nexus.settings.models.runtime_setting import RuntimeSetting
from nexus.settings.models.setting_category import SettingCategoryModel
from nexus.tool_manager.models.rate_limit_config import RateLimit
from nexus.tool_manager.models.tool import Tool, ToolParameter
from nexus.tool_manager.models.tool_execution import ToolExecution
from nexus.tool_manager.models.tool_provider import ToolProvider
from nexus.tool_manager.models.usage_counter import UsageCounter
from nexus.workflows.models import WebhookTrigger, Workflow, WorkflowVersion
from nexus.workflows.models.activity_execution import ActivityExecution
from nexus.workflows.models.execution import Execution

# Ensure models are registered with SQLModel metadata

ALL_MODELS = [
    Principal,
    GlobalRevocationTimestamp,
    Installation,
    Invocation,
    User,
    Workflow,
    WorkflowVersion,
    Execution,
    ActivityExecution,
    ToolProvider,
    Tool,
    ToolParameter,
    RateLimit,
    ToolExecution,
    UsageCounter,
    UserTokenConfig,
    TokenUsageRecord,
    FileMetadata,
    ApprovalRequest,
    IdentityProvider,
    IdpGroupMappingEntry,
    Integration,
    IntegrationProjectAssignment,
    RuntimeSetting,
    SettingCategoryModel,
    Secret,
    EncryptedSecret,
    Credential,
    CredentialType,
    ServiceAccount,
    Project,
    Group,
    Role,
    Policy,
    RoleAssignment,
    RefreshSession,
    WebhookTrigger,
    AuditOutboxRecord,
    AuditTableMetadata,
]
