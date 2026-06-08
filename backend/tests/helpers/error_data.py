"""Helper functions for validating RFC 9457 error response data."""

from typing import Any

from httpx import Response


def assert_error_data(
    response: Response,
    *,
    error_type: str,
    title: str,
    detail: str,
    code: str,
    retryable: bool,
) -> None:
    """Assert that error response matches RFC 9457 format and expected values.

    Args:
        response: The HTTP response object to validate
        error_type: Expected error type URI (required)
        title: Expected error title (required)
        detail: Expected error detail message (required)
        code: Expected error code (required)
        retryable: Expected retryable flag (required)

    """
    # Assert RFC 9457 content type
    assert response.headers["content-type"] == "application/problem+json", (
        f"Expected content-type 'application/problem+json', got '{response.headers.get('content-type')}'"
    )

    # Parse response data
    data: dict[str, Any] = response.json()

    # Assert required RFC 9457 fields are present
    assert "type" in data, "Error response must include 'type' field"
    assert "title" in data, "Error response must include 'title' field"
    assert "detail" in data, "Error response must include 'detail' field"
    assert "code" in data, "Error response must include 'code' field"
    assert "retryable" in data, "Error response must include 'retryable' field"

    # Assert specific values match exactly
    assert data["type"] == error_type, f"Expected type '{error_type}', got '{data['type']}'"
    assert data["title"] == title, f"Expected title '{title}', got '{data['title']}'"
    assert data["detail"] == detail, f"Expected detail '{detail}', got '{data['detail']}'"
    assert data["code"] == code, f"Expected code '{code}', got '{data['code']}'"
    assert data["retryable"] == retryable, f"Expected retryable {retryable}, got {data['retryable']}"
