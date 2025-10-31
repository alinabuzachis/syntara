# WebSocket Example Directory

This directory contains examples and documentation for the WebSocket router system.

## Multi-Channel Architecture

The WebSocket system uses a **component-based multi-channel** approach where one YAML file can define multiple WebSocket channels.

### File Organization

```
/src/nexus/ws/
├── example.yaml     # AsyncAPI specification (defines multiple channels)
└── example.py       # Handler module with channel-specific functions
```

**Architecture**:
1. **YAML filename** determines the **component name**
   - `example.yaml` → component "example"
   - One component can define multiple channels

2. **Channels** are defined within the YAML
   - `example.yaml` defines: coffee, chat, agent-events channels
   - Each channel has its own endpoint path

3. **Python handler** provides channel-specific functions
   - `handle_coffee()` - handles coffee channel messages
   - `handle_chat()` - handles chat channel messages
   - `handle_agent_events()` - handles agent-events channel messages
   - Optional background tasks: `on_connect_{channel}()`

4. **Channel naming** normalizes hyphens to underscores
   - YAML: `agent-events` → Python: `handle_agent_events()`
   - This allows kebab-case in URLs while using valid Python identifiers

### Component vs Channel

**Component** (example):
- Defined by YAML filename
- Groups related channels together
- One handler module per component

**Channels** (coffee, chat, agent-events):
- Defined within component's YAML
- Each has independent endpoint path
- Each has independent message handlers

### Example AsyncAPI Specification

See `/src/nexus/ws/example.yaml` for the actual spec used by the system.

Key sections:
- `channels.example.address`: Defines endpoint path
- `channels.example.messages`: Defines message types
- `components.messages`: Defines message schemas

### Example Handlers

See `/src/nexus/ws/example.py` for the full handler implementation.

#### Pattern 1: Simple Request/Response (Coffee Channel)

```python
# example.py
async def handle_coffee(message: dict) -> dict:
    """Convert input characters to coffee words."""
    input_text = message["input"]
    coffee_words = [COFFEE_WORDS[c.lower()] for c in input_text]
    return {"output": " ".join(coffee_words)}
```

**Endpoint**: `ws://localhost:8000/ws/example/v1/coffee`

#### Pattern 2: Bidirectional with Background Task (Chat Channel)

```python
# example.py
async def handle_chat(message: dict) -> dict:
    """Echo message in uppercase."""
    return {"reply": message["message"].upper(), "type": "echo"}

async def on_connect_chat(websocket, connection_id: str):
    """Send random messages every 3 seconds."""
    while True:
        await asyncio.sleep(3)
        await websocket.send_json({
            "reply": random.choice(RANDOM_MESSAGES),
            "type": "random",
            "timestamp": datetime.now(UTC).isoformat()
        })
```

**Endpoint**: `ws://localhost:8000/ws/example/v1/chat`

**Features**:
- Client requests get uppercase echo responses
- Server sends random messages every 3 seconds independently
- Background task cancelled automatically on disconnect

#### Pattern 3: Subscription-Based Event Streaming (Agent-Events Channel)

```python
# example.py
from collections import defaultdict
from nexus.core.websocket.connection import get_current_connection_id

# Global subscription tracking
agent_subscriptions: dict[str, set[str]] = defaultdict(set)

async def handle_agent_events(message: dict) -> dict:
    """Manage event subscriptions (subscribe/unsubscribe)."""
    connection_id = get_current_connection_id()
    action = message["action"]
    groups = message["groups"]

    if action == "subscribe":
        agent_subscriptions[connection_id].update(groups)
        status = "subscribed"
    elif action == "unsubscribe":
        agent_subscriptions[connection_id] -= set(groups)
        status = "unsubscribed"

    return {"status": status, "action": action, "groups": groups}

async def on_connect_agent_events(websocket, connection_id: str):
    """Send events to subscribed connections only."""
    # Two independent event generators run concurrently
    # Events only sent if connection subscribed to that group
    async def send_log_events():
        while True:
            await asyncio.sleep(random.randint(3, 8))
            if "log" in agent_subscriptions[connection_id]:
                await websocket.send_json({
                    "type": "event",
                    "group": "log",
                    "level": "info",
                    "message": "Processing..."
                })

    async def send_progress_events():
        while True:
            await asyncio.sleep(random.randint(3, 8))
            if "progress" in agent_subscriptions[connection_id]:
                await websocket.send_json({
                    "type": "event",
                    "group": "progress",
                    "progress": random.randint(0, 100),
                    "task": "Data processing"
                })

    await asyncio.gather(send_log_events(), send_progress_events())
```

**Endpoint**: `ws://localhost:8000/ws/example/v1/agent_events`

**Features**:
- Dynamic subscription management (subscribe/unsubscribe to event groups)
- Connection-specific subscription state using `get_current_connection_id()`
- Multiple independent event streams (log and progress)
- Events only sent to subscribed connections
- Random intervals (3-8 seconds) per event group

## Testing

### Coffee Channel
```bash
websocat "ws://localhost:8000/ws/example/v1/coffee"
```

Send a request:
```json
{"input": "hi"}
```

Expected response:
```json
{
  "output": "espresso hario",
  "timestamp": "2025-10-29T10:30:00.000Z"
}
```

### Chat Channel
```bash
websocat "ws://localhost:8000/ws/example/v1/chat"
```

Send a request:
```json
{"message": "hello"}
```

Expected responses:
```json
{"reply": "HELLO", "type": "echo", "timestamp": "2025-10-29T10:30:00.000Z"}
{"reply": "How's your day going?", "type": "random", "timestamp": "2025-10-29T10:30:03.000Z"}
```

### Agent-Events Channel
```bash
websocat "ws://localhost:8000/ws/example/v1/agent_events"
```

Subscribe to events:
```json
{"action": "subscribe", "groups": ["log", "progress"]}
```

Expected responses:
```json
{"status": "subscribed", "action": "subscribe", "groups": ["log", "progress"], "timestamp": "..."}
{"type": "event", "group": "log", "level": "info", "message": "Processing...", "timestamp": "..."}
{"type": "event", "group": "progress", "progress": 25, "task": "Data processing", "timestamp": "..."}
```

Unsubscribe:
```json
{"action": "unsubscribe", "groups": ["log"]}
```

## Documentation

For complete documentation, see:
- **[spec.md](../spec.md)**: Business requirements
- **[plan.md](../plan.md)**: Architecture and implementation
- **[data-model.md](../data-model.md)**: Message formats and validation
- **[hooks.md](../hooks.md)**: Hook system documentation
- **[quickstart.md](../quickstart.md)**: Testing guide
