"""Shared fixtures for all integration tests.

Provides OPA mocking so that integration tests outside ``tests/integration/api/``
(which has its own richer OPA mock using the CLI) can still run without an OPA
server.

Overrides ``test_db_session`` to use real commits (not rollback-based
isolation) because integration tests often create data that must be visible
across multiple database connections (e.g. API clients, concurrent sessions).
"""

import asyncio
import contextlib
import sys
from collections.abc import AsyncGenerator, Generator
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
import sqlalchemy
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from uvicorn import Config, Server

from nexus.authz.engine import clear_opa_cache, init_opa_cache
from nexus.authz.models.project import Project
from nexus.authz.resolver import AUTHENTICATED_GROUP_NAME
from nexus.core.models.group import Group
from nexus.core.websocket.router import build_websocket_router


async def _truncate_all_tables(engine: AsyncEngine) -> None:
    """Remove all data from user tables without touching migration state."""
    preparer = engine.dialect.identifier_preparer
    async with engine.begin() as conn:
        result = await conn.execute(
            sqlalchemy.text(
                """
                SELECT table_schema, table_name
                FROM information_schema.tables
                WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                ORDER BY table_schema, table_name
                """
            )
        )
        tables = [
            f"{preparer.quote_schema(schema)}.{preparer.quote(table_name)}"
            if schema and schema != "public"
            else preparer.quote(table_name)
            for schema, table_name in result
            if table_name not in ("alembic_version", "installation", "runtime_settings", "setting_categories")
        ]

        if not tables:
            return

        truncate_stmt = sqlalchemy.text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE")
        await conn.execute(truncate_stmt)


@pytest_asyncio.fixture
async def test_db_session_factory(test_db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create an async session factory from the test database engine."""
    return async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def test_db_session(
    test_db_engine: AsyncEngine, test_db_session_factory: async_sessionmaker[AsyncSession]
) -> AsyncGenerator[AsyncSession, None]:
    """Create an integration test database session with real commits.

    Integration tests need data visible across multiple connections (API
    clients, concurrent sessions).  Uses TRUNCATE before each test for
    isolation instead of the rollback approach used by unit tests.
    """
    await _truncate_all_tables(test_db_engine)

    session = test_db_session_factory()
    try:
        yield session
        if session.is_active:
            await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@pytest_asyncio.fixture
async def test_project_id(test_db_session: AsyncSession) -> UUID:
    """Create a test project and return its ID.

    Provides a non-builtin project for tests that create project-scoped resources.
    """
    project = Project(name=f"test-project-{uuid4().hex[:8]}", description="Test project")
    test_db_session.add(project)
    await test_db_session.flush()
    await test_db_session.refresh(project)
    return project.id


@pytest_asyncio.fixture(autouse=True)
async def _seed_authenticated_group(test_db_session: AsyncSession) -> None:
    """Ensure the built-in authenticated group exists for every integration test."""
    result = await test_db_session.exec(
        select(Group).where(Group.name == AUTHENTICATED_GROUP_NAME, Group.deleted_at.is_(None))  # type: ignore[union-attr]
    )
    if not result.first():
        test_db_session.add(Group(id=uuid4(), name=AUTHENTICATED_GROUP_NAME, is_builtin=True, labels={}))
        await test_db_session.flush()


@pytest_asyncio.fixture
async def _seed_integration_data(test_db_session: AsyncSession) -> None:
    """Seed authz and builtin workflow data.

    Not autouse — directories opt in via autouse wrapper fixtures in subdirectory conftest files.
    This avoids inflating workflow/resource counts in pagination and telemetry tests.
    """
    from nexus.authz.seed import seed_authz_data
    from nexus.workflows.seed_builtin import seed_builtin_workflows

    await seed_authz_data(test_db_session)
    await seed_builtin_workflows(test_db_session)


@pytest.fixture(autouse=True)
def _reset_opa_cache() -> Generator[None, None, None]:
    """Reset OPA cache between integration tests."""
    init_opa_cache(enabled=True, ttl_seconds=300)
    yield
    clear_opa_cache()


@pytest.fixture(autouse=True)
def _mock_opa_allow_all(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace OPA client with one that always allows requests.

    This is a lightweight fallback for integration tests that don't live
    under ``tests/integration/api/`` (those use the CLI-based mock).
    The ``api`` conftest's ``_mock_opa`` fixture overrides this one for
    tests in that directory because pytest uses the most-specific conftest.
    """
    from nexus.api.main import app
    from nexus.authz.dependencies import get_opa_client

    mock_opa = AsyncMock()
    mock_opa.evaluate = AsyncMock(
        return_value={
            "allow": True,
            "deny": False,
            "matched_policy": "test-allow-all",
            "allowed_projects": ["*"],
        }
    )

    def _mock_getter(request: Any = None) -> AsyncMock:  # noqa: ANN401
        return mock_opa

    monkeypatch.setattr("nexus.authz.dependencies.get_opa_client", _mock_getter)
    monkeypatch.setattr("nexus.workflows.executions_router.get_opa_client", _mock_getter)

    app.dependency_overrides[get_opa_client] = lambda: mock_opa


@pytest.fixture
def websocket_example_app(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[tuple[Path, FastAPI], None, None]:
    """Create a test application and return FastAPI app.

    Returns:
        Tuple of (project_root, configured FastAPI app)

    """
    # Create directory structure
    project_root = tmp_path / "project"
    nexus_dir = project_root / "src" / "nexus"
    core_dir = nexus_dir / "core" / "websocket"
    core_dir.mkdir(parents=True)

    component_dir = nexus_dir / "testcomp"
    ws_dir = component_dir / "ws"
    ws_dir.mkdir(parents=True)

    schemas_dir = nexus_dir / "schemas" / "testcomp"
    schemas_dir.mkdir(parents=True)

    # Create __init__.py files
    (nexus_dir / "__init__.py").touch()
    (component_dir / "__init__.py").touch()
    (ws_dir / "__init__.py").touch()
    (core_dir / "__init__.py").touch()

    # Create handlers.py
    handlers1_content = '''"""Handler file."""
from datetime import datetime, timezone
from typing import Any


async def handle_chat(message: dict[str, Any], connection_id: str) -> dict[str, Any]:
    """Handle chat messages - returns uppercase."""
    return {
        "reply": message["message"].upper(),
        "type": "echo",
        "handler": "handlers1",
    }


async def handle_coffee(message: dict[str, Any], connection_id: str) -> dict[str, Any]:
    """Handle coffee requests - returns coffee word."""
    return {
        "output": "espresso",
        "handler": "handlers1",
    }
'''
    (ws_dir / "handlers1.py").write_text(handlers1_content)

    handlers2_content = '''"""Handler file."""
import asyncio
from datetime import datetime, timezone
from typing import Any
from starlette.websockets import WebSocket


async def handle_events(message: dict[str, Any], connection_id: str) -> dict[str, Any]:
    """Handle event subscription requests."""
    return {
        "status": "subscribed",
        "group": message["group"],
        "handler": "handlers2",
    }


async def on_connect_tokens(websocket: WebSocket, connection_id: str) -> None:
    """Send tokens on connection for receive-only channel testing."""
    # Send 5 tokens with sequence numbers
    for i in range(5):
        token_event = {
            "token": f"token_{i}",
            "sequence": i,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await websocket.send_json(token_event)
        # Small delay to ensure messages are sent sequentially
        await asyncio.sleep(0.01)
'''
    (ws_dir / "handlers2.py").write_text(handlers2_content)

    # Create AsyncAPI specs
    handlers1_spec = """---
asyncapi: 3.0.0
info:
  title: Example Component WebSocket API
  version: 1.0.0
  description: |
    Example WebSocket component demonstrating multiple channels.

servers:
  development:
    host: localhost:8000
    protocol: ws
    description: Local development server
  production:
    host: api.nexus.example.com
    protocol: wss
    description: Production server with TLS

channels:
  coffee:
    address: /ws/testcomp/v1/coffee
    description: |
      Coffee word generator endpoint that receives input text and
      responds with coffee-related words.

      For each character in the input, the server returns a different
      coffee-related word.
      Example: input="hi" returns "espresso hario"

      Connection lifecycle:
      1. Client initiates WebSocket handshake to /ws/testcomp/v1/coffee
      2. Server accepts connection
      3. Client sends CoffeeRequest message with input text
      4. Server responds with CoffeeResponse containing
         space-separated coffee words
      5. Connection remains open for additional requests
      6. Either party can close the connection

    messages:
      coffeeRequest:
        $ref: '#/components/messages/CoffeeRequest'
      coffeeResponse:
        $ref: '#/components/messages/CoffeeResponse'
      errorResponse:
        $ref: '#/components/messages/ErrorResponse'

  chat:
    address: /ws/testcomp/v1/chat
    description: |
      Bidirectional chat endpoint with server-initiated messages.

      Features:
      - Server sends random messages to client every 3 seconds
      - Client can send messages and receives uppercase echo responses

      Connection lifecycle:
      1. Client initiates WebSocket handshake to /ws/testcomp/v1/chat
      2. Server accepts connection and starts sending random messages
      3. Client can send ChatRequest with message text at any time
      4. Server responds with ChatResponse containing uppercase message
      5. Server continues sending random messages every 3 seconds
      6. Either party can close the connection

    messages:
      chatRequest:
        $ref: '#/components/messages/ChatRequest'
      chatResponse:
        $ref: '#/components/messages/ChatResponse'
      errorResponse:
        $ref: '#/components/messages/ErrorResponse'

operations:
  sendCoffeeRequest:
    action: send
    channel:
      $ref: '#/channels/coffee'
    summary: Send a coffee request with input text
    description: |
      Client sends input text to receive coffee-related words for
      each character
    messages:
      - $ref: '#/channels/coffee/messages/coffeeRequest'

  receiveCoffeeResponse:
    action: receive
    channel:
      $ref: '#/channels/coffee'
    summary: Receive a coffee response
    description: |
      Server responds with space-separated coffee words corresponding
      to each input character
    messages:
      - $ref: '#/channels/coffee/messages/coffeeResponse'
      - $ref: '#/channels/coffee/messages/errorResponse'

  sendChatRequest:
    action: send
    channel:
      $ref: '#/channels/chat'
    summary: Send a chat message
    description: |
      Client sends a chat message and receives an uppercase echo response
    messages:
      - $ref: '#/channels/chat/messages/chatRequest'

  receiveChatResponse:
    action: receive
    channel:
      $ref: '#/channels/chat'
    summary: Receive chat responses and random messages
    description: |
      Server responds with uppercase echo of client messages and
      periodically sends random messages every 3 seconds
    messages:
      - $ref: '#/channels/chat/messages/chatResponse'
      - $ref: '#/channels/chat/messages/errorResponse'

components:
  messages:
    CoffeeRequest:
      name: CoffeeRequest
      title: Coffee Request
      summary: Request message containing input text for coffee word generation
      contentType: application/json
      payload:
        type: object
        required:
          - input
        properties:
          input:
            type: string
            description: The input text to convert to coffee words
            minLength: 1
            maxLength: 100
            example: hi
      examples:
        - name: SimpleInput
          summary: A simple coffee request
          payload:
            input: hi
        - name: LongerInput
          summary: A longer coffee request
          payload:
            input: coffee

    CoffeeResponse:
      name: CoffeeResponse
      title: Coffee Response
      summary: Response message containing coffee-related words
      contentType: application/json
      payload:
        type: object
        required:
          - output
        properties:
          output:
            type: string
            description: |
              Space-separated coffee words corresponding to each
              input character
            example: espresso hario
          timestamp:
            type: string
            format: date-time
            description: |
              ISO 8601 timestamp when the response was generated
              (UTC)
            example: '2025-10-23T10:30:00.000Z'
      examples:
        - name: SimpleCoffeeResponse
          summary: Response to a simple coffee request (input="hi")
          payload:
            output: espresso hario
            timestamp: '2025-10-23T10:30:00.000Z'
        - name: LongerCoffeeResponse
          summary: Response to a longer coffee request (input="coffee")
          payload:
            output: cappuccino origin filter filter extraction extraction
            timestamp: '2025-10-23T10:30:00.000Z'

    ChatRequest:
      name: ChatRequest
      title: Chat Request
      summary: Request message containing chat text
      contentType: application/json
      payload:
        type: object
        required:
          - message
        properties:
          message:
            type: string
            description: The chat message to send
            minLength: 1
            maxLength: 1000
            example: Hello there
      examples:
        - name: SimpleMessage
          summary: A simple chat message
          payload:
            message: Hello there
        - name: LongerMessage
          summary: A longer chat message
          payload:
            message: How are you doing today?

    ChatResponse:
      name: ChatResponse
      title: Chat Response
      summary: Response message containing chat reply
      contentType: application/json
      payload:
        type: object
        required:
          - reply
          - type
        properties:
          reply:
            type: string
            description: |
              The chat reply - either uppercase echo of client message
              or a random server message
            example: HELLO THERE
          type:
            type: string
            description: Type of message - 'echo' for client echo or 'random' for server-initiated
            enum:
              - echo
              - random
            example: echo
          timestamp:
            type: string
            format: date-time
            description: |
              ISO 8601 timestamp when the response was generated
              (UTC)
            example: '2025-10-23T10:30:00.000Z'
      examples:
        - name: EchoResponse
          summary: Response echoing client message in uppercase
          payload:
            reply: HELLO THERE
            type: echo
            timestamp: '2025-10-23T10:30:00.000Z'
        - name: RandomMessage
          summary: Random server-initiated message
          payload:
            reply: How's your day going?
            type: random
            timestamp: '2025-10-23T10:30:00.000Z'

    ErrorResponse:
      name: ErrorResponse
      title: Error Response
      summary: Error message for invalid requests
      contentType: application/json
      payload:
        type: object
        required:
          - error
          - message
        properties:
          error:
            type: string
            description: Error type identifier
            enum:
              - INVALID_REQUEST
              - VALIDATION_ERROR
              - INTERNAL_ERROR
            example: VALIDATION_ERROR
          message:
            type: string
            description: Human-readable error message
            example: Name field is required
          timestamp:
            type: string
            format: date-time
            description: ISO 8601 timestamp when the error occurred (UTC)
            example: '2025-10-23T10:30:00.000Z'
      examples:
        - name: ValidationError
          summary: Error when input is missing
          payload:
            error: VALIDATION_ERROR
            message: Input field is required
            timestamp: '2025-10-23T10:30:00.000Z'
        - name: InvalidRequest
          summary: Error when request format is invalid
          payload:
            error: INVALID_REQUEST
            message: Invalid JSON format
            timestamp: '2025-10-23T10:30:00.000Z'
"""
    (schemas_dir / "websocket-handlers1.yaml").write_text(handlers1_spec)

    handlers2_spec = """---
asyncapi: 3.0.0
info:
  title: Example Component WebSocket API
  version: 1.0.0
  description: |
    Example WebSocket component demonstrating multiple channels.

servers:
  development:
    host: localhost:8000
    protocol: ws
    description: Local development server
  production:
    host: api.nexus.example.com
    protocol: wss
    description: Production server with TLS

channels:

  events:
    address: /ws/testcomp/v1/events
    messages:
      eventsRequest:
        $ref: '#/components/messages/EventsRequest'
      eventsResponse:
        $ref: '#/components/messages/EventsResponse'

  tokens:
    address: /ws/testcomp/v1/tokens
    description: |
      Receive-only token streaming endpoint for integration testing.

      This channel demonstrates receive-only functionality where the server
      sends tokens to clients without requiring any client messages.

      Features:
      - Server sends periodic token events via on_connect handler
      - No Request message required (receive-only)
      - No handle_tokens function required (receive-only)
      - Connection stays alive until client disconnects

      Connection lifecycle:
      1. Client initiates WebSocket handshake to /ws/testcomp/v1/tokens
      2. Server accepts connection
      3. Server begins sending Token messages immediately via on_connect
      4. Client receives tokens without sending any requests
      5. Either party can close the connection

    messages:
      token:
        $ref: '#/components/messages/Token'

operations:

  receiveTokens:
    action: receive
    channel:
      $ref: '#/channels/tokens'
    summary: Receive periodic token events
    description: |
      Server sends token events at regular intervals without requiring
      any client messages. This is a receive-only operation demonstrating
      server-push functionality.
    messages:
      - $ref: '#/channels/tokens/messages/token'

  sendEventsRequest:
    action: send
    channel:
      $ref: '#/channels/events'
    messages:
      - $ref: '#/channels/events/messages/eventsRequest'

  receiveEventsResponse:
    action: receive
    channel:
      $ref: '#/channels/events'
    messages:
      - $ref: '#/channels/events/messages/eventsResponse'

components:
  messages:
    EventsRequest:
      contentType: application/json
      payload:
        type: object
        required:
          - group
        properties:
          group:
            type: string
    EventsResponse:
      contentType: application/json
      payload:
        type: object
        required:
          - status
          - group
        properties:
          status:
            type: string
          group:
            type: string
          handler:
            type: string
    Token:
      name: Token
      title: Token
      summary: Token event message for receive-only channel testing
      contentType: application/json
      payload:
        type: object
        required:
          - token
          - sequence
        properties:
          token:
            type: string
            description: The token value
            example: token_0
          sequence:
            type: integer
            description: Sequential number of this token
            minimum: 0
            example: 0
          timestamp:
            type: string
            format: date-time
            description: ISO 8601 timestamp when the token was generated (UTC)
            example: '2025-12-01T10:30:00.000Z'
      examples:
        - name: FirstToken
          summary: First token in sequence
          payload:
            token: token_0
            sequence: 0
            timestamp: '2025-12-01T10:30:00.000Z'
        - name: SecondToken
          summary: Second token in sequence
          payload:
            token: token_1
            sequence: 1
            timestamp: '2025-12-01T10:30:01.000Z'
"""
    (schemas_dir / "websocket-handlers2.yaml").write_text(handlers2_spec)

    # Add project to Python path
    sys.path.insert(0, str(nexus_dir.parent))

    # Mock __file__ to point to our temporary structure
    fake_endpoint_factory = core_dir / "endpoint_factory.py"
    fake_endpoint_factory.touch()
    monkeypatch.setattr(
        "nexus.core.websocket.endpoint_factory.__file__",
        str(fake_endpoint_factory),
    )

    # Mock importlib.resources.files to return our temp schemas directory
    def mock_files(package: str) -> Path:
        if package == "nexus":
            return nexus_dir
        msg = f"Package {package} not found"
        raise FileNotFoundError(msg)

    monkeypatch.setattr("nexus.core.websocket.endpoint_factory.files", mock_files)

    # Create FastAPI app
    app = FastAPI()
    router = build_websocket_router()
    app.include_router(router)

    yield project_root, app

    # Cleanup
    sys.path.remove(str(nexus_dir.parent))


async def _wait_for_server(host: str, port: int) -> None:
    """Poll until the server is accepting TCP connections."""
    async with asyncio.timeout(10.0):
        while True:
            try:
                _, writer = await asyncio.open_connection(host, port)
                writer.close()
                await writer.wait_closed()
                return
            except OSError:
                await asyncio.sleep(0.1)


@pytest_asyncio.fixture
async def example_app_server(websocket_example_app: tuple[Path, FastAPI]) -> AsyncGenerator[tuple[Path, FastAPI], None]:
    """Create Server with Websocket example channels."""
    project_root, app = websocket_example_app
    config = Config(app, host="127.0.0.1", port=9999, log_level="error")
    server = Server(config)

    # Run server in background task
    server_task = asyncio.create_task(server.serve())

    await _wait_for_server("127.0.0.1", 9999)

    yield project_root, app

    # Shutdown server gracefully
    server.should_exit = True
    try:
        await asyncio.wait_for(server_task, timeout=5.0)
    except TimeoutError:
        # Force cancellation if graceful shutdown times out
        server_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await server_task
