"""Utility functions for WebSocket operations."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


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


def is_receive_only_channel(spec: dict[str, Any], channel_name: str) -> bool:
    """Determine if a channel is receive-only based on operations.

    A channel is receive-only if:
    1. The spec has an 'operations' section
    2. At least one operation references the channel with action='receive'
    3. No operations reference the channel with action='send'

    If no operations section exists, the channel is assumed to be bidirectional
    for backwards compatibility.

    Args:
        spec: AsyncAPI specification dictionary
        channel_name: Name of the channel to check (e.g., 'invocations')

    Returns:
        True if channel is receive-only, False otherwise

    Examples:
        >>> spec = {
        ...     "operations": {
        ...         "receiveEvents": {
        ...             "action": "receive",
        ...             "channel": {"$ref": "#/channels/invocations"}
        ...         }
        ...     }
        ... }
        >>> is_receive_only_channel(spec, "invocations")
        True

    """
    operations = spec.get("operations", {})

    if not operations:
        logger.debug("No operations section found, treating %s as bidirectional", channel_name)
        return False

    # Handle malformed operations section
    if not isinstance(operations, dict):
        logger.debug("Operations section is not a dict, treating %s as bidirectional", channel_name)
        return False

    # Build the channel reference to match against
    channel_ref = f"#/channels/{channel_name}"
    has_receive = False
    has_send = False

    # Check all operations for this channel
    for operation_name, operation in operations.items():
        if not isinstance(operation, dict):
            continue

        channel = operation.get("channel", {})

        # Check if this operation references our channel
        if channel.get("$ref") == channel_ref:
            action = operation.get("action", "")

            if action == "receive":
                has_receive = True
                logger.debug("Operation '%s' has receive action for %s", operation_name, channel_name)
            elif action == "send":
                has_send = True
                logger.debug("Operation '%s' has send action for %s", operation_name, channel_name)

    is_receive_only = has_receive and not has_send
    logger.debug(
        "Channel %s: receive=%s, send=%s, receive_only=%s",
        channel_name,
        has_receive,
        has_send,
        is_receive_only,
    )

    return is_receive_only
