"""Alembic environment configuration for async migrations."""

from __future__ import annotations

import asyncio
from logging.config import fileConfig
from typing import TYPE_CHECKING, Literal

from alembic import context

if TYPE_CHECKING:
    from collections.abc import Iterable, MutableMapping

    from alembic.autogenerate.api import AutogenContext
    from alembic.operations.ops import MigrationScript
    from alembic.runtime.migration import MigrationContext
    from sqlalchemy.engine import Connection
    from sqlalchemy.schema import SchemaItem
from alembic.autogenerate import renderers
from alembic.operations import MigrateOperation
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlmodel import SQLModel

from nexus.agent_orchestrator.models.invocation import Invocation
from nexus.agent_orchestrator.token_manager.models import TokenUsageRecord, UserTokenConfig
from nexus.approvals.models.approval_request import ApprovalRequest
from nexus.authz._ast_codegen import build_ops_call, build_role_ops_call
from nexus.authz.migration_ops import PolicyAdd, RoleAdd, RolePolicyAppend
from nexus.authz.models import (
    GroupRoleAssignment,
    Policy,
    Project,
    Role,
    RolePolicyLink,
    UserRoleAssignment,
)
from nexus.core.config.base import get_settings
from nexus.core.logging.logging import configure_structlog
from nexus.core.models import User
from nexus.core.models.group import Group
from nexus.core.models.installation import Installation
from nexus.core.models.secret import EncryptedSecret, Secret
from nexus.credentials.models.credential import Credential
from nexus.credentials.models.credential_type import CredentialType
from nexus.files.models import FileMetadata
from nexus.identity_providers.models.identity_provider import IdentityProvider
from nexus.settings.models.runtime_setting import RuntimeSetting
from nexus.settings.models.setting_category import SettingCategoryModel
from nexus.tool_manager.models.rate_limit_config import RateLimit
from nexus.tool_manager.models.tool import Tool, ToolParameter
from nexus.tool_manager.models.tool_execution import ToolExecution
from nexus.tool_manager.models.tool_provider import ToolProvider
from nexus.tool_manager.models.usage_counter import UsageCounter
from nexus.workflows.models import Workflow, WorkflowVersion
from nexus.workflows.models.activity_execution import ActivityExecution
from nexus.workflows.models.execution import Execution

# Ensure models are registered with SQLModel metadata

_ = (
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
    RuntimeSetting,
    SettingCategoryModel,
    Secret,
    EncryptedSecret,
    Credential,
    CredentialType,
    Project,
    Group,
    Role,
    RolePolicyLink,
    Policy,
    GroupRoleAssignment,
    UserRoleAssignment,
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
    """Exclude tables managed by other Alembic environments (metadata side).

    ``include_name`` only filters *reflected* (database) objects.  Tables that
    exist only in the SQLModel metadata (e.g. ``audit_events`` before its
    migration has been applied to this database) bypass ``include_name``
    entirely.  ``include_object`` is called for *both* reflected and metadata
    objects, so we use it to catch the metadata-only case.
    """
    return not (type_ == "table" and name in _EXCLUDED_TABLES)


# Use the same database URL from centralized settings unless overridden.
config.set_main_option(
    "sqlalchemy.url",
    config.get_main_option("sqlalchemy.url") or get_settings().database_url.render_as_string(hide_password=False),
)


# ---------------------------------------------------------------------------
# Custom Alembic ops for inline policy injection
# ---------------------------------------------------------------------------


class _ApplyPoliciesOp(MigrateOperation):
    """Renders apply_policy_ops([...]) into a migration's upgrade function."""

    def __init__(self, policy_ops: list[PolicyAdd | RolePolicyAppend]) -> None:
        self.policy_ops = policy_ops


class _RevertPoliciesOp(MigrateOperation):
    """Renders revert_policy_ops([...]) into a migration's downgrade function."""

    def __init__(self, policy_ops: list[PolicyAdd | RolePolicyAppend]) -> None:
        self.policy_ops = policy_ops


class _ApplyRolesOp(MigrateOperation):
    """Renders apply_role_ops([...]) into a migration's upgrade function."""

    def __init__(self, role_ops: list[RoleAdd]) -> None:
        self.role_ops = role_ops


class _RevertRolesOp(MigrateOperation):
    """Renders revert_role_ops([...]) into a migration's downgrade function."""

    def __init__(self, role_ops: list[RoleAdd]) -> None:
        self.role_ops = role_ops


def _policy_import_line(ops: list[PolicyAdd | RolePolicyAppend]) -> str:
    has_appends = any(isinstance(o, RolePolicyAppend) for o in ops)
    if has_appends:
        return "from nexus.authz.migration_ops import PolicyAdd, RolePolicyAppend, apply_policy_ops, revert_policy_ops"
    return "from nexus.authz.migration_ops import PolicyAdd, apply_policy_ops, revert_policy_ops"


_ROLE_IMPORT_LINE = "from nexus.authz.migration_ops import RoleAdd, apply_role_ops, revert_role_ops"


@renderers.dispatch_for(_ApplyPoliciesOp)
def _render_apply_policies(autogen_context: AutogenContext, op: _ApplyPoliciesOp) -> str:
    autogen_context.imports.add(_policy_import_line(op.policy_ops))
    return build_ops_call("apply_policy_ops", op.policy_ops)


@renderers.dispatch_for(_RevertPoliciesOp)
def _render_revert_policies(autogen_context: AutogenContext, op: _RevertPoliciesOp) -> str:
    autogen_context.imports.add(_policy_import_line(op.policy_ops))
    return build_ops_call("revert_policy_ops", op.policy_ops)


@renderers.dispatch_for(_ApplyRolesOp)
def _render_apply_roles(autogen_context: AutogenContext, op: _ApplyRolesOp) -> str:
    autogen_context.imports.add(_ROLE_IMPORT_LINE)
    return build_role_ops_call("apply_role_ops", op.role_ops)


@renderers.dispatch_for(_RevertRolesOp)
def _render_revert_roles(autogen_context: AutogenContext, op: _RevertRolesOp) -> str:
    autogen_context.imports.add(_ROLE_IMPORT_LINE)
    return build_role_ops_call("revert_role_ops", op.role_ops)


# ---------------------------------------------------------------------------
# process_revision_directives hook
# ---------------------------------------------------------------------------


def _generate_policy_migration_hook(
    _context: MigrationContext,
    _revision: str | Iterable[str | None] | Iterable[str],
    directives: list[MigrationScript],
) -> None:
    """Inject policy and role ops into the migration generated by --autogenerate.

    Called by Alembic after the schema diff is computed.  If new policies or
    roles are discovered they are appended inline to the migration's
    upgrade/downgrade functions via custom Alembic ops — no second file is
    generated.
    """
    if not directives:
        return

    from pathlib import Path  # noqa: PLC0415

    from nexus.authz.migration_ops import RolePolicyAppend as _RolePolicyAppend  # noqa: PLC0415
    from nexus.authz.migration_scanner import (  # noqa: PLC0415
        find_untracked_policies,
        find_untracked_roles,
    )
    from nexus.authz.role_conventions import BUILTIN_ROLES_REGISTRY, EXTRA_POLICIES_REGISTRY  # noqa: PLC0415
    from nexus.core.database.migrations import versions  # noqa: PLC0415

    migrations_dir = Path(versions.__file__).parent

    # --- Policies ---
    new_policies = find_untracked_policies(EXTRA_POLICIES_REGISTRY, migrations_dir)

    # --- Roles ---
    new_roles = find_untracked_roles(BUILTIN_ROLES_REGISTRY, migrations_dir)

    if not new_policies and not new_roles:
        return

    upgrade_ops = directives[0].upgrade_ops
    downgrade_ops = directives[0].downgrade_ops

    if new_roles:
        role_ops = [RoleAdd(r.name, r.description, r.is_builtin) for r in new_roles]
        if upgrade_ops is not None:
            upgrade_ops.ops.append(_ApplyRolesOp(role_ops))
        if downgrade_ops is not None:
            downgrade_ops.ops.append(_RevertRolesOp(role_ops))

    if new_policies:
        role_appends: list[_RolePolicyAppend] = sorted(
            [_RolePolicyAppend(role, p.name) for p in new_policies for role in p.roles],
            key=lambda op: (op.role_name, op.policy_name),
        )
        policy_ops: list[PolicyAdd | RolePolicyAppend] = [
            PolicyAdd(p.name, p.description, p.statements) for p in new_policies
        ]
        policy_ops.extend(role_appends)
        if upgrade_ops is not None:
            upgrade_ops.ops.append(_ApplyPoliciesOp(policy_ops))
        if downgrade_ops is not None:
            downgrade_ops.ops.append(_RevertPoliciesOp(policy_ops))


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
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
        process_revision_directives=_generate_policy_migration_hook,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in async mode."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
