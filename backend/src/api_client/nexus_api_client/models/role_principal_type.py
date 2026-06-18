from enum import Enum


class RolePrincipalType(str, Enum):
    GROUP = "group"
    SERVICE_ACCOUNT = "service_account"
    USER = "user"

    def __str__(self) -> str:
        return str(self.value)
