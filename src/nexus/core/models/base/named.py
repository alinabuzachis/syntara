"""NamedResource SQLModel definition.

This module contains the NamedResource SQLModel class that extends BaseResource
with user-provided identification fields (name and description).
"""

from abc import ABC

from sqlmodel import Field

from nexus.core.constants import FieldLimits
from nexus.core.models.base import BaseResource


class NamedResource(BaseResource, ABC):
    """Abstract SQLModel for resources with human-readable name and description.

    Extends BaseResource with name and description fields that users can set
    to provide meaningful identification for resources.

    This class cannot be instantiated directly and does not create database tables.
    Concrete subclasses must inherit from this class and set table=True.

    ```
    class MyNamedResource(NamedResource, table=True):
        pass
    ```

    Attributes:
        name: Human-readable name for the resource (required, 1-255 chars)
        description: Optional detailed description (max 2000 chars)

    Inherits from BaseResource:
        id: UUID primary key
        created_at: Creation timestamp
        updated_at: Last update timestamp
        labels: Optional key-value metadata

    """

    # User-provided identification
    name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        description="Human-readable name for the resource",
        index=True,
    )

    description: str | None = Field(
        default=None, max_length=FieldLimits.DESCRIPTION_MAX_LENGTH, description="Detailed description of the resource"
    )
