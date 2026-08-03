from enum import Enum


class InvocationStatus(str, Enum):
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    CREATED = "created"
    FAILED = "failed"
    PAUSED = "paused"
    RUNNING = "running"

    def __str__(self) -> str:
        return str(self.value)
