from enum import Enum


class ExecutionMode(str, Enum):
    DEBUG = "debug"
    STANDARD = "standard"
    TEST = "test"

    def __str__(self) -> str:
        return str(self.value)
