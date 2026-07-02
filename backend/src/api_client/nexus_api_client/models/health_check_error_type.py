from enum import Enum


class HealthCheckErrorType(str, Enum):
    AUTH_FAILURE = "auth_failure"
    CONNECTION_ERROR = "connection_error"
    RATE_LIMIT = "rate_limit"
    SSL_ERROR = "ssl_error"
    TIMEOUT = "timeout"

    def __str__(self) -> str:
        return str(self.value)
