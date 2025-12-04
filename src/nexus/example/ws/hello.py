"""Example WebSocket component with multiple channels.

This component demonstrates multi-channel WebSocket support with:
- Coffee channel: Generates coffee-related words for each input character
- Chat channel: Bidirectional chat with random server messages and uppercase echo
- Agent-events channel: Subscription-based event streaming with log and progress groups

Convention-based discovery:
- example.yaml defines multiple channels (coffee, chat, agent-events)
- example.py (this file) provides channel-specific handler functions:
  - handle_coffee() for /ws/example/v1/coffee
  - handle_chat() for /ws/example/v1/chat
  - handle_agent_events() for /ws/example/v1/agent-events
  - on_connect_chat() for chat channel background tasks
  - on_connect_agent_events() for agent-events channel background tasks
"""

import asyncio
import logging
import random
from datetime import UTC, datetime
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


# Coffee Channel Implementation
# ==============================

# Coffee-related words mapped to characters (a-z, case-insensitive)
# Example: "hi" → "espresso hario"
COFFEE_WORDS = {
    "a": "arabica",
    "b": "barista",
    "c": "cappuccino",
    "d": "drip",
    "e": "extraction",
    "f": "french",
    "g": "grind",
    "h": "espresso",
    "i": "hario",
    "j": "java",
    "k": "kenyan",
    "l": "latte",
    "m": "mocha",
    "n": "nitro",
    "o": "origin",
    "p": "pour",
    "q": "quaker",
    "r": "roast",
    "s": "sumatra",
    "t": "turkish",
    "u": "urn",
    "v": "vienna",
    "w": "washed",
    "x": "excelso",
    "y": "yemen",
    "z": "zest",
}


async def handle_coffee(message: dict[str, Any], _connection_id: str) -> dict[str, Any]:
    """Handle incoming coffee channel message.

    The framework validates the message against CoffeeRequest schema before calling this.
    For each character in the input, we return a corresponding coffee word.

    Args:
        message: Validated message dict with 'input' field
        _connection_id: Unique identifier for the WebSocket connection (unused in this handler)

    Returns:
        Response dict with 'output' field

    Examples:
        >>> request = {"input": "hi"}
        >>> response = await handle_coffee(request, "test-connection-id")
        >>> response["output"]
        'espresso hario'

    """
    # Get input text from message
    input_text = message["input"]
    coffee_words = []

    # Generate coffee words for each character
    for char in input_text:
        char_lower = char.lower()
        if char_lower in COFFEE_WORDS:
            coffee_words.append(COFFEE_WORDS[char_lower])
        else:
            # For non-alphabetic characters, use "filter" as a default
            coffee_words.append("filter")

    # Join all words with spaces
    output = " ".join(coffee_words)

    # Return response dict (timestamp added by before_send hook)
    return {"output": output}


# Chat Channel Implementation
# ============================

# Random messages to send to chat clients
RANDOM_CHAT_MESSAGES = [
    "How's your day going?",
    "Did you know cats sleep 70% of their lives?",
    "The weather is nice today!",
    "Coffee is the best thing ever invented.",
    "What are you working on?",
    "Stay hydrated!",
    "Time for a break?",
    "Fun fact: Honey never spoils!",
]


async def handle_chat(message: dict[str, Any], _connection_id: str) -> dict[str, Any]:
    """Handle incoming chat channel message.

    The framework validates the message against ChatRequest schema before calling this.
    We return the message in uppercase as an echo response.

    Args:
        message: Validated message dict with 'message' field
        _connection_id: Unique identifier for the WebSocket connection (unused in this handler)

    Returns:
        Response dict with 'reply' and 'type' fields

    Examples:
        >>> request = {"message": "hello there"}
        >>> response = await handle_chat(request, "test-connection-id")
        >>> response["reply"]
        'HELLO THERE'
        >>> response["type"]
        'echo'

    """
    # Get the chat message
    chat_message = message["message"]

    # Return uppercase echo
    return {
        "reply": chat_message.upper(),
        "type": "echo",
    }


async def on_connect_chat(websocket: WebSocket, connection_id: str) -> None:
    """Background task for chat channel - sends random messages every 3 seconds.

    This function runs concurrently with the main message loop and sends
    random chat messages to the client every 3 seconds.

    Args:
        websocket: The WebSocket connection to send messages to
        connection_id: Unique ID for this connection (for logging)

    """
    logger.info("Starting chat background task for connection '%s'", connection_id)

    try:
        while True:
            # Wait 3 seconds
            await asyncio.sleep(3)

            # Select a random message
            random_message = random.choice(RANDOM_CHAT_MESSAGES)  # noqa: S311

            # Send random message to client
            await websocket.send_json(
                {
                    "reply": random_message,
                    "type": "random",
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            )

            logger.debug(
                "Sent random message to connection '%s': %s",
                connection_id,
                random_message,
            )

    except WebSocketDisconnect:
        logger.info("Chat background task ended - connection closed: '%s'", connection_id)
    except asyncio.CancelledError:
        logger.info("Chat background task cancelled for connection '%s'", connection_id)
        raise
    except Exception:
        logger.exception(
            "Error in chat background task for connection '%s'",
            connection_id,
        )


# Agent Events Channel Implementation
# =====================================

# Track subscriptions per connection
# Key: connection_id, Value: set of subscribed groups ('log', 'progress')
_agent_events_subscriptions: dict[str, set[str]] = {}

# Static pool of log messages with levels
LOG_MESSAGES = [
    {"level": "debug", "message": "Agent initialized successfully"},
    {"level": "info", "message": "Processing task queue"},
    {"level": "info", "message": "Connected to message broker"},
    {"level": "warning", "message": "High memory usage detected"},
    {"level": "info", "message": "Task completed successfully"},
    {"level": "debug", "message": "Cache hit for resource"},
    {"level": "error", "message": "Failed to connect to external service"},
    {"level": "info", "message": "Starting background worker"},
    {"level": "debug", "message": "Received heartbeat signal"},
    {"level": "warning", "message": "Request timeout, retrying..."},
]

# Task name constants for progress messages
TASK_PROCESSING_DOCUMENTS = "Processing documents"
TASK_ANALYZING_DATA = "Analyzing data"
TASK_TRAINING_MODEL = "Training model"

# Static pool of progress updates
PROGRESS_MESSAGES = [
    {"task": TASK_PROCESSING_DOCUMENTS, "progress": 15, "message": "Completed 15 of 100 documents"},
    {"task": TASK_PROCESSING_DOCUMENTS, "progress": 30, "message": "Completed 30 of 100 documents"},
    {"task": TASK_PROCESSING_DOCUMENTS, "progress": 45, "message": "Completed 45 of 100 documents"},
    {"task": TASK_PROCESSING_DOCUMENTS, "progress": 60, "message": "Completed 60 of 100 documents"},
    {"task": TASK_PROCESSING_DOCUMENTS, "progress": 75, "message": "Completed 75 of 100 documents"},
    {"task": TASK_PROCESSING_DOCUMENTS, "progress": 90, "message": "Completed 90 of 100 documents"},
    {"task": TASK_ANALYZING_DATA, "progress": 25, "message": "Analyzed 250 of 1000 records"},
    {"task": TASK_ANALYZING_DATA, "progress": 50, "message": "Analyzed 500 of 1000 records"},
    {"task": TASK_ANALYZING_DATA, "progress": 75, "message": "Analyzed 750 of 1000 records"},
    {"task": TASK_TRAINING_MODEL, "progress": 40, "message": "Epoch 4 of 10 completed"},
]


async def handle_agent_events(message: dict[str, Any], connection_id: str) -> dict[str, Any]:
    """Handle incoming agent-events channel message.

    The framework validates the message against AgentEventsRequest schema before calling this.
    Processes subscribe/unsubscribe requests for event groups.

    Args:
        message: Validated message dict with 'action' and 'groups' fields
        connection_id: Unique identifier for the WebSocket connection

    Returns:
        Response dict with 'status', 'action', and 'groups' fields

    Examples:
        >>> request = {"action": "subscribe", "groups": ["log", "progress"]}
        >>> response = await handle_agent_events(request, "test-connection-id")
        >>> response["status"]
        'success'

    """
    action = message["action"]
    groups = message["groups"]

    if connection_id not in _agent_events_subscriptions:
        logger.warning(
            "Connection '%s' not found in subscriptions, initializing empty set",
            connection_id,
        )
        _agent_events_subscriptions[connection_id] = set()

    # Update subscriptions based on action
    if action == "subscribe":
        _agent_events_subscriptions[connection_id].update(groups)
        logger.info(
            "Connection '%s' subscribed to groups: %s (current: %s)",
            connection_id,
            groups,
            _agent_events_subscriptions[connection_id],
        )
    elif action == "unsubscribe":
        _agent_events_subscriptions[connection_id].difference_update(groups)
        logger.info(
            "Connection '%s' unsubscribed from groups: %s (remaining: %s)",
            connection_id,
            groups,
            _agent_events_subscriptions[connection_id],
        )

    # Return confirmation
    return {
        "status": "success",
        "action": action,
        "groups": groups,
    }


async def on_connect_agent_events(websocket: WebSocket, connection_id: str) -> None:
    """Background task for agent-events channel - sends events based on subscriptions.

    This function runs concurrently with the main message loop and manages:
    1. Subscription tracking for this connection
    2. Independent background tasks for each event group
    3. Sending events at random 3-8 second intervals

    The main message loop handles subscribe/unsubscribe requests via handle_agent_events,
    which updates the subscription state that we read here.

    Args:
        websocket: The WebSocket connection to send messages to
        connection_id: Unique ID for this connection

    """
    logger.info("Starting agent-events background task for connection '%s'", connection_id)

    # Initialize empty subscription set for this connection
    _agent_events_subscriptions[connection_id] = set()

    # Create tasks for each event group
    log_task = None
    progress_task = None

    try:
        # Start background tasks for each group
        log_task = asyncio.create_task(
            _send_log_events(websocket, connection_id),
            name=f"log-{connection_id}",
        )
        progress_task = asyncio.create_task(
            _send_progress_events(websocket, connection_id),
            name=f"progress-{connection_id}",
        )

        # Keep running until disconnected
        await asyncio.gather(log_task, progress_task)

    except WebSocketDisconnect:
        logger.info("Agent-events background task ended - connection closed: '%s'", connection_id)
    except asyncio.CancelledError:
        logger.info("Agent-events background task cancelled for connection '%s'", connection_id)
        raise
    except Exception:
        logger.exception(
            "Error in agent-events background task for connection '%s'",
            connection_id,
        )
    finally:
        # Clean up subscription tracking
        _agent_events_subscriptions.pop(connection_id, None)
        logger.debug("Cleaned up subscriptions for connection '%s'", connection_id)

        # Cancel group tasks if still running
        if log_task and not log_task.done():
            log_task.cancel()
        if progress_task and not progress_task.done():
            progress_task.cancel()


async def _send_log_events(websocket: WebSocket, connection_id: str) -> None:
    """Send log events at random 3-8 second intervals if subscribed.

    Args:
        websocket: The WebSocket connection to send messages to
        connection_id: Unique ID for this connection

    """
    try:
        while True:
            # Random interval between 3-8 seconds
            interval = random.uniform(3, 8)  # noqa: S311
            await asyncio.sleep(interval)

            # Check if subscribed to log group
            subscribed_groups = _agent_events_subscriptions.get(connection_id, set())
            if "log" not in subscribed_groups:
                continue

            # Select a random log message
            log_data = random.choice(LOG_MESSAGES)  # noqa: S311

            # Send log event to client
            await websocket.send_json(
                {
                    "type": "event",
                    "group": "log",
                    "level": log_data["level"],
                    "message": log_data["message"],
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            )

            logger.debug(
                "Sent log event to connection '%s': %s - %s",
                connection_id,
                log_data["level"],
                log_data["message"],
            )

    except (WebSocketDisconnect, asyncio.CancelledError):
        logger.debug("Log events task ended for connection '%s'", connection_id)
        raise
    except Exception:
        logger.exception(
            "Error in log events task for connection '%s'",
            connection_id,
        )


async def _send_progress_events(websocket: WebSocket, connection_id: str) -> None:
    """Send progress events at random 3-8 second intervals if subscribed.

    Args:
        websocket: The WebSocket connection to send messages to
        connection_id: Unique ID for this connection

    """
    try:
        while True:
            # Random interval between 3-8 seconds (independent from log)
            interval = random.uniform(3, 8)  # noqa: S311
            await asyncio.sleep(interval)

            # Check if subscribed to progress group
            subscribed_groups = _agent_events_subscriptions.get(connection_id, set())
            if "progress" not in subscribed_groups:
                continue

            # Select a random progress message
            progress_data = random.choice(PROGRESS_MESSAGES)  # noqa: S311

            # Send progress event to client
            await websocket.send_json(
                {
                    "type": "event",
                    "group": "progress",
                    "task": progress_data["task"],
                    "progress": progress_data["progress"],
                    "message": progress_data["message"],
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            )

            logger.debug(
                "Sent progress event to connection '%s': %s - %d%%",
                connection_id,
                progress_data["task"],
                progress_data["progress"],
            )

    except (WebSocketDisconnect, asyncio.CancelledError):
        logger.debug("Progress events task ended for connection '%s'", connection_id)
        raise
    except Exception:
        logger.exception(
            "Error in progress events task for connection '%s'",
            connection_id,
        )


# Tokens Channel Implementation (Receive-Only)
# ==============================================


async def handle_tokens(_message: dict[str, Any]) -> dict[str, Any]:
    """Handle tokens channel messages (should never be called).

    This function exists only to satisfy handler discovery requirements.
    It should never be called since tokens is a receive-only channel.

    Args:
        _message: Incoming message (should never receive any)

    Returns:
        Error response

    Raises:
        RuntimeError: Always raises since this should never be called

    """
    msg = "handle_tokens should never be called - tokens is a receive-only channel"
    raise RuntimeError(msg)


async def on_connect_tokens(websocket: WebSocket, connection_id: str) -> None:
    """Background task for tokens channel - sends periodic tokens.

    This demonstrates receive-only channel functionality where the server
    sends events without requiring any client messages.

    Args:
        websocket: The WebSocket connection to send messages to
        connection_id: Unique ID for this connection (for logging)

    """
    logger.info("Starting tokens background task for connection '%s'", connection_id)

    try:
        # Send 5 tokens with short delays for testing
        for i in range(5):
            await asyncio.sleep(0.2)  # Short delay for fast tests

            # Send token event to client
            await websocket.send_json(
                {
                    "token": f"token_{i}",
                    "sequence": i,
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            )

            logger.debug(
                "Sent token %d to connection '%s'",
                i,
                connection_id,
            )

    except WebSocketDisconnect:
        logger.info("Tokens background task ended - connection closed: '%s'", connection_id)
    except asyncio.CancelledError:
        logger.info("Tokens background task cancelled for connection '%s'", connection_id)
        raise
    except Exception:
        logger.exception(
            "Error in tokens background task for connection '%s'",
            connection_id,
        )
