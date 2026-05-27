"""Alembic environment configuration for async migrations."""

from __future__ import annotations

import asyncio
from logging.config import fileConfig
from typing import TYPE_CHECKING, Literal

from alembic import context

if TYPE_CHECKING:
    from collections.abc import MutableMapping

    from sqlalchemy.engine import Connection
    from sqlalchemy.schema import SchemaItem
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlmodel import SQLModel

from nexus.agent_orchestrator.models.invocation import Invocation
from nexus.agent_orchestrator.token_manager.models import TokenUsageRecord, UserTokenConfig
from nexus.approvals.models.approval_request import ApprovalRequest
from nexus.auth.models.global_revocation_timestamp import GlobalRevocationTimestamp
from nexus.auth.session.models import RefreshSession
from nexus.authz.models import (
    Policy,
    Project,
    Role,
    RoleAssignment,
)
from nexus.core.config.base import get_settings
from nexus.core.database.ssl import build_ssl_connect_args
from nexus.core.logging.logging import configure_structlog
from nexus.core.models import User
from nexus.core.models.group import Group
from nexus.core.models.installation import Installation
from nexus.core.models.secret import EncryptedSecret, Secret
from nexus.credentials.models.credential import Credential
from nexus.credentials.models.credential_type import CredentialType
from nexus.files.models import FileMetadata
from nexus.identity_providers.models.identity_provider import IdentityProvider
from nexus.identity_providers.models.idp_group_mapping import IdpGroupMappingEntry
from nexus.integrations.models.integration import Integration, IntegrationProjectAssignment
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

_ = (
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
    Project,
    Group,
    Role,
    Policy,
    RoleAssignment,
    RefreshSession,
    WebhookTrigger,
)

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set target metadata from models
target_metadata = SQLModel.metadata

# Tables managed by a separate Alembic environment (audit_migrations/).
# Exclude them from autogenerate so ``alembic check`` does not report them
# as pending changes.
_EXCLUDED_TABLES: frozenset[str] = frozenset({"audit_events"})


def _include_name(
    name: str | None,
    type_: Literal["schema", "table", "column", "index", "unique_constraint", "foreign_key_constraint"],
    _parent_names: MutableMapping[Literal["schema_name", "table_name", "schema_qualified_table_name"], str | None],
) -> bool:
    """Exclude tables managed by other Alembic environments (reflected side)."""
    if type_ == "table":
        return name not in _EXCLUDED_TABLES
    return True


def _include_object(
    object: SchemaItem,  # noqa: A002, ARG001
    name: str | None,
    type_: Literal["schema", "table", "column", "index", "unique_constraint", "foreign_key_constraint"],
    reflected: bool,  # noqa: FBT001, ARG001
    compare_to: SchemaItem | None,  # noqa: ARG001
) -> bool:
    """Exclude tables managed by other Alembic environments (metadata side)."""
    return not (type_ == "table" and name in _EXCLUDED_TABLES)


# Use the same database URL from centralized settings unless overridden.
config.set_main_option(
    "sqlalchemy.url",
    config.get_main_option("sqlalchemy.url") or get_settings().database_url.render_as_string(hide_password=False),
)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_name=_include_name,
        include_object=_include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run migrations with the given connection."""
    configure_structlog()
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        compare_type=True,
        compare_server_default=True,
        include_name=_include_name,
        include_object=_include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in async mode."""
    settings = get_settings()
    ssl_connect_args = build_ssl_connect_args(
        ssl_mode=settings.db_ssl_mode,
        ssl_root_cert=settings.db_ssl_root_cert,
        ssl_cert=settings.db_ssl_cert,
        ssl_key=settings.db_ssl_key,
    )
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=ssl_connect_args,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
