"""Fixtures specific to agent orchestrator integration tests."""

from collections.abc import AsyncGenerator, AsyncIterator, Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from langchain_core.messages import AIMessage
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.auth.services.token_service import TokenService
from nexus.core.database.session import get_db
from nexus.core.models import User


def _extract_tool_results(messages: list[Any]) -> tuple[str, bool, list[dict[str, str]]]:
    """Extract prompt content and tool execution results from message history."""
    prompt_content = ""
    tool_call_made = False
    tool_results = []

    for msg in messages:
        if hasattr(msg, "content") and msg.content:
            prompt_content += str(msg.content).lower()
        # Check if we've already seen tool messages (indicating tools were executed)
        if hasattr(msg, "__class__") and "ToolMessage" in str(msg.__class__):
            tool_call_made = True
            # Extract tool name and result from the tool message
            if hasattr(msg, "name") and hasattr(msg, "content"):
                tool_results.append({"name": msg.name, "result": msg.content})

    return prompt_content, tool_call_made, tool_results


def _create_tool_completion_response(tool_results: list[dict[str, str]]) -> str:
    """Create specific response based on tool execution results."""
    if not tool_results:
        return "I've executed the requested tools successfully. Your request has been completed."

    response_parts = []
    for tool_result in tool_results:
        if tool_result["name"] == "mock_calculator":
            response_parts.append(f"I calculated the result using the calculator tool and got: {tool_result['result']}")
        elif tool_result["name"] == "mock_greeter":
            response_parts.append(f"I used the greeting tool and it responded: {tool_result['result']}")
        elif tool_result["name"] == "mock_retry_tool":
            response_parts.append(f"I used the retry tool and got: {tool_result['result']}")
        elif tool_result["name"] == "mock_network_tool":
            response_parts.append(f"I used the network tool and got: {tool_result['result']}")
        elif tool_result["name"] == "mock_failing_tool":
            response_parts.append(f"I attempted to use the failing tool and got: {tool_result['result']}")
        else:
            response_parts.append(f"I executed the {tool_result['name']} tool and got: {tool_result['result']}")

    return " ".join(response_parts) + " Your request has been completed successfully."


@pytest.fixture
def mock_tool_aware_llm() -> Generator[MagicMock, None, None]:
    """Mock LLM that intelligently uses tools based on prompts.

    This fixture creates an LLM mock that:
    1. Recognizes when prompts require tool usage
    2. Returns appropriate tool calls for calculator/greeter/retry scenarios
    3. Allows real tool discovery (_get_tools is NOT mocked)
    4. Enables assertions on tool execution and results

    The LLM will return tool calls for:
    - "calculate", "sum", "add" -> calls mock_calculator
    - "greet", "hello" -> calls mock_greeter
    - "mock_retry_tool", "retry tool" -> calls mock_retry_tool
    - "mock_network_tool", "network tool", "api.example.com" -> calls mock_network_tool
    - "mock_failing_tool", "failing tool" -> calls mock_failing_tool
    - Other prompts -> regular text response

    Yields:
        MagicMock representing the LLM instance with smart tool calling

    """

    def create_smart_response(messages: list[Any], **_kwargs: object) -> AIMessage:
        """Create appropriate response based on the prompt content and conversation state."""
        prompt_content, tool_call_made, tool_results = _extract_tool_results(messages)

        # If tool already executed, provide specific response based on which tool was used
        if tool_call_made:
            final_content = _create_tool_completion_response(tool_results)
            return AIMessage(
                content=final_content,
                response_metadata={"model": "mock-tool-aware-model", "finish_reason": "stop"},
            )

        # Determine which tool to call based on prompt content
        tool_configs = [
            (
                ["calculate", "sum", "add", "5", "3"],
                {
                    "content": "I'll calculate that for you using the calculator tool.",
                    "tool_call": {"name": "mock_calculator", "args": {"a": 5, "b": 3}, "id": "calc_call_1"},
                },
            ),
            (
                ["greet", "hello", "hi"],
                {
                    "content": "I'll greet you using the greeting tool.",
                    "tool_call": {"name": "mock_greeter", "args": {"name": "Test User"}, "id": "greet_call_1"},
                },
            ),
            (
                ["mock_retry_tool", "retry tool"],
                {
                    "content": "I'll use the retry tool to process your message.",
                    "tool_call": {"name": "mock_retry_tool", "args": {"message": "test data"}, "id": "retry_call_1"},
                },
            ),
            (
                ["mock_network_tool", "network tool", "api.example.com"],
                {
                    "content": "I'll use the network tool to connect to the endpoint.",
                    "tool_call": {
                        "name": "mock_network_tool",
                        "args": {"endpoint": "api.example.com"},
                        "id": "network_call_1",
                    },
                },
            ),
            (
                ["mock_failing_tool", "failing tool"],
                {
                    "content": "I'll use the failing tool to process your data.",
                    "tool_call": {"name": "mock_failing_tool", "args": {"data": "test input"}, "id": "failing_call_1"},
                },
            ),
        ]

        # Check each tool configuration
        for keywords, config in tool_configs:
            if any(keyword in prompt_content for keyword in keywords):
                return AIMessage(
                    content=str(config["content"]),
                    tool_calls=[config["tool_call"]],
                    response_metadata={"model": "mock-tool-aware-model", "finish_reason": "tool_calls"},
                )

        # Default response when no tool is needed
        return AIMessage(
            content="I can help you with that. No tools needed for this request.",
            response_metadata={"model": "mock-tool-aware-model", "finish_reason": "stop"},
        )

    mock_llm = MagicMock()
    mock_llm_with_tools = AsyncMock()
    mock_llm.model_name = "mock-tool-aware-model"

    # Set up the async mock with our smart response function
    mock_llm_with_tools.ainvoke = AsyncMock(side_effect=create_smart_response)
    mock_llm.bind_tools = MagicMock(return_value=mock_llm_with_tools)

    # Mock CompressorService to avoid OpenRouter API key requirement
    mock_compressor = AsyncMock()
    mock_compressor.compress = AsyncMock(return_value="Compressed content for testing")

    # Patch LLM locations but DO NOT patch _get_tools (we want real tool discovery)
    with (
        patch(
            "nexus.invocations.router.get_openrouter_llm",
            return_value=mock_llm,
        ),
        patch(
            "nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm",
            return_value=mock_llm,
        ),
        patch(
            "nexus.agent_orchestrator.context_manager.compressor.CompressorService",
            return_value=mock_compressor,
        ),
    ):
        yield mock_llm


@pytest_asyncio.fixture
async def auth_client_with_tool_aware_mocked_llm(
    test_db_session: AsyncSession,
    session_app: FastAPI,
    test_user: User,
    mock_tool_aware_llm: MagicMock,
) -> AsyncGenerator[AsyncClient, None]:
    """Create authenticated test client with tool-aware mocked LLM.

    This client:
    - Uses mocked LLM that intelligently calls tools based on prompts
    - Allows real tool discovery and execution
    - Enables testing of complete tool execution workflow
    - Supports assertions on tool calls and results
    - Includes valid JWT authentication

    Args:
        test_db_session: Test database session
        session_app: Session-scoped app
        test_user: Existing test user from main conftest.py
        mock_tool_aware_llm: Tool-aware LLM mock

    Yields:
        AsyncClient with JWT authentication and smart tool calling

    """
    # Generate real JWT token for the test user
    token_service = TokenService()
    access_token = token_service.create_access_token(
        user_id=test_user.id,
        username=test_user.username,
        email=test_user.email or "",
    )

    # Override database session in the app
    async def override_get_db() -> AsyncIterator[AsyncSession]:
        yield test_db_session

    session_app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=session_app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {access_token}"},
    ) as client:
        yield client

    # Clean up
    session_app.dependency_overrides.clear()
