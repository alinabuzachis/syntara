from enum import Enum


class IntegrationScope(str, Enum):
    GLOBAL = "global"
    PROJECT = "project"

    def __str__(self) -> str:
        return str(self.value)
