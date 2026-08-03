from enum import Enum


class ToolStatus(str, Enum):
    AVAILABLE = "available"
    ERROR = "error"
    MISSING = "missing"

    def __str__(self) -> str:
        return str(self.value)
