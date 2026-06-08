from enum import Enum


class PrincipalType(str, Enum):
    GROUP = "group"
    USER = "user"

    def __str__(self) -> str:
        return str(self.value)
