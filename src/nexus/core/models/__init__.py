"""SQLModel base classes for shared API resources.

This module contains the core SQLModel classes that define the foundation
for all API resources in the Nexus platform.
"""

from nexus.core.models.base import BaseResource
from nexus.core.models.error import Error
from nexus.core.models.named import NamedResource
from nexus.core.models.pagination import ResourcesResponse, ResourcesResponseBase
from nexus.core.models.resource import Resource
from nexus.core.models.soft_deletable import SoftDeletableResource
from nexus.core.models.user_owned import UserOwnedResource

__all__ = [
    "BaseResource",
    "Error",
    "NamedResource",
    "Resource",
    "ResourcesResponse",
    "ResourcesResponseBase",
    "SoftDeletableResource",
    "UserOwnedResource",
]
