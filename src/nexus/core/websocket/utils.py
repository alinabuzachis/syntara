"""Utility functions for WebSocket operations."""


def normalize_channel_name(name: str) -> str:
    """Normalize a channel name to snake_case Python identifier.

    Converts kebab-case and other formats to snake_case.

    Args:
        name: Channel name (e.g., 'agent-events', 'coffee', 'my-channel')

    Returns:
        Normalized name in snake_case (e.g., 'agent_events', 'coffee', 'my_channel')

    Examples:
        >>> normalize_channel_name('agent-events')
        'agent_events'
        >>> normalize_channel_name('coffee')
        'coffee'
        >>> normalize_channel_name('my-complex-name')
        'my_complex_name'

    """
    return name.replace("-", "_")
