from enum import Enum


class ApprovalRequestStatus(str, Enum):
    APPROVED = "approved"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    PENDING = "pending"
    REJECTED = "rejected"

    def __str__(self) -> str:
        return str(self.value)
