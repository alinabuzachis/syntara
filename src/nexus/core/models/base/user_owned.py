"""UserOwnedResource SQLModel definition.

This module contains the UserOwnedResource SQLModel class that extends BaseResource
with user ownership and modification tracking.
"""

from abc import ABC
from uuid import UUID

from sqlmodel import Field

from nexus.core.models.base import BaseResource


class UserOwnedResource(BaseResource, ABC):
    """Abstract SQLModel for resources tracking ownership and modifications.

    Extends BaseResource with fields to track which users created and last
    updated the resource, enabling audit trails and access control.

    This class cannot be instantiated directly and does not create database tables.
    Concrete subclasses must inherit from this class and set table=True.

    Attributes:
        created_by: UUID of user who created the resource (required)
        updated_by: Optional UUID of user who last updated the resource

    Inherits from BaseResource:
        id: UUID primary key
        created_at: Creation timestamp
        updated_at: Last update timestamp
        labels: Optional key-value metadata

    """

    # User ownership tracking
    created_by: UUID = Field(description="User who created the resource", index=True)

    updated_by: UUID | None = Field(default=None, description="User who last updated the resource", index=True)

    def update_by_user(self, user_id: UUID) -> None:
        """Update the resource's updated_by field.

        Args:
            user_id: UUID of the user performing the update

        """
        self.updated_by = user_id

    def is_owned_by(self, user_id: UUID) -> bool:
        """Check if the resource is owned by the specified user.

        Args:
            user_id: UUID of the user to check ownership for

        Returns:
            True if the resource was created by the specified user

        """
        return self.created_by == user_id

    def was_updated_by(self, user_id: UUID) -> bool:
        """Check if the resource was last updated by the specified user.

        Args:
            user_id: UUID of the user to check for last update

        Returns:
            True if the resource was last updated by the specified user

        """
        return self.updated_by == user_id
