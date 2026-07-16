from enum import Enum


class WorkflowVersionReadStatus(str, Enum):
    DRAFT = "draft"
    PREVIOUSLY_PUBLISHED = "previously_published"
    PUBLISHED = "published"

    def __str__(self) -> str:
        return str(self.value)
