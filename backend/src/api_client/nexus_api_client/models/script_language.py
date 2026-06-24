from enum import Enum


class ScriptLanguage(str, Enum):
    BASH = "bash"
    PYTHON = "python"

    def __str__(self) -> str:
        return str(self.value)
