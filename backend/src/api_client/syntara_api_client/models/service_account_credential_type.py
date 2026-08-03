from enum import Enum


class ServiceAccountCredentialType(str, Enum):
    CLIENT_CREDENTIALS = "client_credentials"

    def __str__(self) -> str:
        return str(self.value)
