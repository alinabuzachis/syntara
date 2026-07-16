"""SQLModel base classes for shared API resources.

This module contains the core SQLModel classes that define the foundation
for all API resources in the Nexus platform.
"""

from nexus.core.models.group import Group, user_groups
from nexus.core.models.principal import (
    Principal,
    PrincipalType,
)
from nexus.core.models.secret import EncryptedSecret, Secret
from nexus.core.models.user import User
from nexus.core.models.user_identity import UserIdentity
from nexus.core.models.user_reference import UserReference

__all__ = [
    "EncryptedSecret",
    "Group",
    "Principal",
    "PrincipalType",
    "Secret",
    "User",
    "UserIdentity",
    "UserReference",
    "user_groups",
]
