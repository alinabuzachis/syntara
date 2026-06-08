from enum import Enum


class ProviderStatus(str, Enum):
    AVAILABLE = "available"
    ERROR = "error"
    VALIDATING = "validating"

    def __str__(self) -> str:
        return str(self.value)
