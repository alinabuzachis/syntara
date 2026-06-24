from enum import Enum


class AuthenticationType(str, Enum):
    API_KEY = "api_key"
    BASIC = "basic"
    BEARER = "bearer"
    OAUTH2 = "oauth2"

    def __str__(self) -> str:
        return str(self.value)
