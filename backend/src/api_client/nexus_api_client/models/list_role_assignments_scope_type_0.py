from enum import Enum


class ListRoleAssignmentsScopeType0(str, Enum):
    PROJECT = "project"
    SYSTEM = "system"

    def __str__(self) -> str:
        return str(self.value)
