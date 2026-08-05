from enum import Enum


class FileStorageStatus(str, Enum):
    DEGRADED = "degraded"
    ERROR = "error"
    OK = "ok"
    UNCONFIGURED = "unconfigured"

    def __str__(self) -> str:
        return str(self.value)
