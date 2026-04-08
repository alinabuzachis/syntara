"""Alembic environment configuration for async migrations."""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlmodel import SQLModel

from nexus.agent_orchestrator.models.invocation import Invocation
from nexus.agent_orchestrator.token_manager.models import TokenUsageRecord, UserTokenConfig
from nexus.approvals.models.approval_request import ApprovalRequest
from nexus.core.config.base import get_settings
from nexus.core.logging.logging import configure_structlog
from nexus.core.models import User
from nexus.core.models.installation import Installation
from nexus.files.models import FileMetadata
from nexus.settings.models.runtime_setting import RuntimeSetting
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
    RuntimeSetting,
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

# Use the same database URL from centralized settings unless overridden.
config.set_main_option("sqlalchemy.url", config.get_main_option("sqlalchemy.url") or get_settings().database_url)


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
