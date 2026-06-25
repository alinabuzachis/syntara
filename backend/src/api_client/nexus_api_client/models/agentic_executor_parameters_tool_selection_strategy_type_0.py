from enum import Enum


class AgenticExecutorParametersToolSelectionStrategyType0(str, Enum):
    ALL = "ALL"
    NONE = "NONE"
    SELECTED = "SELECTED"

    def __str__(self) -> str:
        return str(self.value)
