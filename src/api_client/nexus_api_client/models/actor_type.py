from enum import Enum


class ActorType(str, Enum):
    SERVICE = "service"
    SYSTEM = "system"
    USER = "user"

    def __str__(self) -> str:
        return str(self.value)
