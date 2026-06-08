from enum import Enum


class AAPJobType(str, Enum):
    CHECK = "check"
    RUN = "run"

    def __str__(self) -> str:
        return str(self.value)
