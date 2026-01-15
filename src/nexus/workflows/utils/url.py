"""URL generation utilities for workflow-related endpoints.

This module provides functions for generating URLs to workflow API endpoints,
particularly useful for activities that need to provide callback URLs to external services.
"""

from uuid import UUID

from nexus.core.config import get_settings


def get_api_base_url() -> str:
    """Get the workflow API base URL from settings or construct it from host/port.

    Returns:
        Base URL for the workflow API (e.g., 'http://nexus:8000/api/v1' or 'http://localhost:8000/api/v1')

    """
    settings = get_settings()

    # Use configured base URL if available
    if settings.workflow_base_url:
        return settings.workflow_base_url.rstrip("/")

    # Otherwise construct from host and port
    # DEVELOPMENT ONLY: Fallback to HTTP for local development
    # Production deployments MUST set workflow_base_url with HTTPS in settings
    host = settings.server_host
    port = settings.server_port

    # Handle common local development hosts
    if host in ("0.0.0.0", "localhost", "127.0.0.1"):  # noqa: S104
        host = "localhost"

    # HTTP is acceptable for local development only  # NOSONAR
    # Production: Configure workflow_base_url with HTTPS in environment settings
    return f"http://{host}:{port}/api/v1"  # NOSONAR


def generate_activity_signal_url(execution_id: UUID, activity_id: str) -> str:
    """Generate a URL for sending signals to a specific activity.

    This URL can be provided to external services that need to send signals
    back to the workflow when certain events occur.

    Args:
        execution_id: The execution ID (database UUID)
        activity_id: The activity ID from the workflow definition

    Returns:
        Complete URL for POSTing signals to the activity

    Example:
        >>> url = generate_activity_signal_url(
        ...     execution_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
        ...     activity_id="approval_step_1"
        ... )
        >>> print(url)
        http://localhost:8000/api/v1/executions/123e4567-e89b-12d3-a456-426614174000/activities/approval_step_1/signal

    """
    base_url = get_api_base_url()
    return f"{base_url}/executions/{execution_id}/activities/{activity_id}/signal"
