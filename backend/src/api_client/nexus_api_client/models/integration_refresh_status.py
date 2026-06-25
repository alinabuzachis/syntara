from enum import Enum


class IntegrationRefreshStatus(str, Enum):
    AVAILABLE = "available"
    ERROR = "error"
    REFRESHING = "refreshing"

    def __str__(self) -> str:
        return str(self.value)
