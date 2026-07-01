"""Base models package.

This package contains foundational model classes for the Nexus application.
"""

from nexus.core.models.base.base_resource import BaseResource
from nexus.core.models.base.named import NamedResource
from nexus.core.models.base.query_params import BaseListParams, BasePaginatedRequest
from nexus.core.models.base.resource import Resource
from nexus.core.models.base.soft_deletable import SoftDeletableResource
from nexus.core.models.base.user_owned import UserOwnedResource

__all__ = [
    "BaseListParams",
    "BasePaginatedRequest",
    "BaseResource",
    "NamedResource",
    "Resource",
    "SoftDeletableResource",
    "UserOwnedResource",
]
