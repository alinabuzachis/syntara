"""SQLModel base classes for shared API resources.

This module contains the core SQLModel classes that define the foundation
for all API resources in the Nexus platform.
"""

from nexus.core.models.group import Group, user_groups
from nexus.core.models.secret import EncryptedSecret, Secret
from nexus.core.models.user import User
from nexus.core.models.user_identity import UserIdentity

__all__ = [
    "EncryptedSecret",
    "Group",
    "Secret",
    "User",
    "UserIdentity",
    "user_groups",
]
