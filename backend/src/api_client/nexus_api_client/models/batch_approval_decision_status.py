from enum import Enum


class BatchApprovalDecisionStatus(str, Enum):
    APPROVED = "approved"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    REJECTED = "rejected"

    def __str__(self) -> str:
        return str(self.value)
