from enum import Enum


class ValidateNameResourceType(str, Enum):
    POLICY = "policy"
    PROJECT = "project"
    ROLE = "role"

    def __str__(self) -> str:
        return str(self.value)
