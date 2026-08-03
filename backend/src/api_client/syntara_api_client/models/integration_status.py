from enum import Enum


class IntegrationStatus(str, Enum):
    AVAILABLE = "available"
    ERROR = "error"
    UNKNOWN = "unknown"
    VALIDATING = "validating"

    def __str__(self) -> str:
        return str(self.value)
