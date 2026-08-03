from enum import Enum


class ApprovalNodeParametersFallbackDecisionType0(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"

    def __str__(self) -> str:
        return str(self.value)
