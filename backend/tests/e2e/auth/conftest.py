"""Thin shim — auth correlation helpers are now provided by nexus_test_sdk.e2e.auth."""

from nexus_test_sdk.e2e.auth import (
    REQUEST_ID_HEADER,
    api_with_request_id,
    client_with_request_id,
    login_with_request_id,
    new_request_id,
)

__all__ = [
    "REQUEST_ID_HEADER",
    "api_with_request_id",
    "client_with_request_id",
    "login_with_request_id",
    "new_request_id",
]
