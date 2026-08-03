from enum import Enum


class ActivityStatus(str, Enum):
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"
    PENDING = "pending"
    RETRYING = "retrying"
    RUNNING = "running"
    SKIPPED = "skipped"
    WAITING = "waiting"

    def __str__(self) -> str:
        return str(self.value)
