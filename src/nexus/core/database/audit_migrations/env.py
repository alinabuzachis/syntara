"""Alembic environment configuration for async audit database migrations."""

from __future__ import annotations

import asyncio
from logging.config import fileConfig
from typing import TYPE_CHECKING, Literal

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlmodel import SQLModel

if TYPE_CHECKING:
    from collections.abc import MutableMapping

    from sqlalchemy.engine import Connection
    from sqlalchemy.schema import SchemaItem

from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.core.config.base import get_settings
from nexus.core.logging.logging import configure_structlog

# Ensure model is registered with SQLModel metadata
_ = (AuditEventRecord,)

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set target metadata from models
target_metadata = SQLModel.metadata

# Only track audit-domain tables during autogenerate.
# SQLModel.metadata is global so without this filter autogenerate would
# emit migrations for every table in the application.
_AUDIT_TABLES: frozenset[str] = frozenset({"audit_events"})


def _include_name(
    name: str | None,
    type_: Literal["schema", "table", "column", "index", "unique_constraint", "foreign_key_constraint"],
    _parent_names: MutableMapping[Literal["schema_name", "table_name", "schema_qualified_table_name"], str | None],
) -> bool:
    """Allow only audit-domain tables through the autogenerate filter (reflected side)."""
    if type_ == "table":
        return name in _AUDIT_TABLES
    return True


def _include_object(
    object: SchemaItem,  # noqa: A002, ARG001
    name: str | None,
    type_: Literal["schema", "table", "column", "index", "unique_constraint", "foreign_key_constraint"],
    reflected: bool,  # noqa: FBT001, ARG001
    compare_to: SchemaItem | None,  # noqa: ARG001
) -> bool:
    """Allow only audit-domain tables through the autogenerate filter (metadata side).

    ``include_name`` only filters *reflected* (database) objects.  Tables that
    exist only in the SQLModel metadata bypass ``include_name`` entirely.
    ``include_object`` catches the metadata-only case — needed because
    SQLModel.metadata is global, so when both envs run in the same process
    (e.g. check_migrations.py) non-audit tables would otherwise appear as
    pending changes.
    """
    if type_ == "table":
        return name in _AUDIT_TABLES
    return True


# Use the audit database URL from centralized settings unless overridden.
config.set_main_option(
    "sqlalchemy.url",
    config.get_main_option("sqlalchemy.url") or get_settings().audit_database_url.render_as_string(hide_password=False),
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
        version_table="alembic_version_audit",
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
        version_table="alembic_version_audit",
        include_name=_include_name,
        include_object=_include_object,
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
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
