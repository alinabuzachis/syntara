from enum import Enum


class FileStatus(str, Enum):
    CONVERSION_FAILED = "conversion_failed"
    CONVERTED = "converted"
    CONVERTING = "converting"
    PENDING_CONVERSION = "pending_conversion"

    def __str__(self) -> str:
        return str(self.value)
