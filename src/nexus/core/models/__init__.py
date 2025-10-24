"""SQLModel base classes for shared API resources.

This module contains the core SQLModel classes that define the foundation
for all API resources in the Nexus platform.
"""

from nexus.core.models.base import (
    BaseResource,
    Error,
    NamedResource,
    Resource,
    ResourcesResponse,
    ResourcesResponseBase,
    SoftDeletableResource,
    UserOwnedResource,
)
from nexus.core.models.user import User, UserRole

__all__ = [
    "BaseResource",
    "Error",
    "NamedResource",
    "Resource",
    "ResourcesResponse",
    "ResourcesResponseBase",
    "SoftDeletableResource",
    "User",
    "UserOwnedResource",
    "UserRole",
]
