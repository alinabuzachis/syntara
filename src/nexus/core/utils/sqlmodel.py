"""SQLModel utility functions for database model configuration.

This module provides helper functions for common SQLModel/SQLAlchemy patterns
used throughout the Nexus project.
"""

from enum import Enum
from typing import Any

from sqlalchemy import Column
from sqlalchemy import Enum as SAEnum


def postgres_enum_column(
    enum_type: type[Enum],
    postgres_name: str,
    *,
    nullable: bool = False,
    index: bool = False,
) -> Column[Any]:
    """Create a SQLAlchemy Column for PostgreSQL enum types.

    This helper creates a properly configured Column that references
    existing PostgreSQL enum types created by Alembic migrations.

    The function uses create_type=False to prevent SQLAlchemy from attempting
    to create the enum type, as it should already exist from migrations.

    Args:
        enum_type: Python Enum class (e.g., ProviderStatus, ToolStatus)
        postgres_name: PostgreSQL enum type name as defined in migrations
            (e.g., "tool_provider_status", "tool_status")
        nullable: Whether column allows NULL values (default: False)
        index: Whether to create an index on this column (default: False)

    Returns:
        Configured Column for use with SQLModel Field's sa_column parameter

    Example:
        >>> from enum import Enum
        >>> class ProviderStatus(str, Enum):
        ...     AVAILABLE = "available"
        ...     ERROR = "error"
        ...     VALIDATING = "validating"
        >>>
        >>> status: ProviderStatus = Field(
        ...     default=ProviderStatus.VALIDATING,
        ...     sa_column=postgres_enum_column(
        ...         ProviderStatus,
        ...         "tool_provider_status",
        ...         index=True,
        ...     ),
        ...     description="Current status of the provider",
        ... )

    Note:
        This pattern is used to ensure that SQLModel/SQLAlchemy references
        the correct PostgreSQL enum type name that was created by Alembic
        migrations, avoiding type mismatch errors like:
        "type 'providerstatus' does not exist"

    """
    return Column(
        SAEnum(
            enum_type,
            name=postgres_name,
            create_type=False,  # Use existing enum from migration
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=nullable,
        index=index,
    )
