from enum import Enum


class AuthType(str, Enum):
    FEDERATED = "federated"
    LOCAL = "local"

    def __str__(self) -> str:
        return str(self.value)
