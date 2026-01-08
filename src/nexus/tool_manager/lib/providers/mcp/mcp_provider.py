"""MCP (Model Context Protocol) provider implementation using langchain."""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from langchain_core.tools import BaseTool

# See https://github.com/langchain-ai/langchain-mcp-adapters/issues/319
from langchain_mcp_adapters.client import MultiServerMCPClient  # type: ignore[import-untyped]

from nexus.tool_manager.lib.exceptions import ToolNotFoundError
from nexus.tool_manager.lib.providers.base import ToolProviderAdapter
from nexus.tool_manager.models import (
    MCPConfiguration,
    Tool,
    ToolParameter,
    ToolParameterType,
    ToolProviderValidationResult,
    ToolSchema,
    ToolStatus,
    ToolValidationResult,
)

logger = logging.getLogger(__name__)

# Log message template for MCP provider operations
_MCP_PROVIDER_LOG_TEMPLATE = "MCP provider %s: %s"


class MCPProvider(ToolProviderAdapter):
    """MCP provider adapter using langchain MultiServerMCPClient.

    This provider integrates with MCP servers using the langchain-mcp-adapters library,
    supporting both SSE and Streaming HTTP transports for communication with MCP servers.

    The configuration is provided as an MCPConfiguration object which includes:
    - provider_type: Always "mcp"
    - base_url: URL of the MCP server
    - api_key: Authentication key for the MCP server (optional)
    """

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        provider_id: UUID | None = None,
        provider_name: str | None = "mcp-provider",
    ) -> None:
        """Initialize MCP provider with configuration.

        Args:
            base_url: URL of the MCP server
            api_key: Authentication key for the MCP server (optional)
            provider_id: Unique identifier for this provider instance (optional for factory)
            provider_name: Human-readable name for the provider (optional for factory)

        Raises:
            ValueError: If configuration is invalid
            ConnectionError: If unable to initialize MCP client

        """
        self.provider_id = provider_id or uuid4()
        self.provider_name = provider_name

        # Create MCPConfiguration from parameters
        self.configuration = MCPConfiguration(
            provider_type="mcp",
            base_url=base_url,
            api_key=api_key,
        )

        # Initialize langchain MCP client
        self._client: MultiServerMCPClient | None = None
        self._tools_cache: dict[str, dict[str, Any]] = {}

    async def _get_client(self) -> MultiServerMCPClient:
        """Get or create the MCP client instance.

        Returns:
            MultiServerMCPClient instance

        Raises:
            ConnectionError: If unable to initialize client

        """
        if self._client is None:
            try:
                # Configure server connection for langchain MCP client
                # Using streamable_http as the primary transport (as per AAP-55733)
                # Use provider_name or fallback to a default key
                server_key = self.provider_name or "mcp-server"
                server_config: dict[str, dict[str, Any]] = {
                    server_key: {
                        "transport": "streamable_http",  # Note: underscore not hyphen
                        "url": self.configuration.base_url,
                    }
                }

                # Add API key as Authorization header if provided
                if self.configuration.api_key:
                    server_config[server_key]["headers"] = {"Authorization": f"Bearer {self.configuration.api_key}"}

                # Initialize the MultiServerMCPClient
                self._client = MultiServerMCPClient(server_config)

                auth_info = " with API key authentication" if self.configuration.api_key else ""
                logger.info(
                    "Initialized MCP client for provider %s using streamable-http transport%s",
                    self.provider_name,
                    auth_info,
                )

            except Exception as e:
                msg = f"Failed to initialize MCP client: {e}"
                logger.exception(msg)
                raise ConnectionError(msg) from e

        return self._client

    async def validate_connection(self) -> ToolProviderValidationResult:
        """Validate connection to the MCP server.

        Returns:
            ToolProviderValidationResult containing validation details

        Raises:
            ProviderError: If connection validation fails due to provider issues
            TimeoutError: If connection times out
            ConnectionError: If unable to establish connection

        """
        timeout = 30
        try:
            logger.info("Validating connection to MCP provider %s", self.provider_name)

            # Get client and attempt to connect
            client = await self._get_client()

            # Test connection by attempting to list tools
            tools = await asyncio.wait_for(client.get_tools(), timeout=timeout)

            logger.info("Successfully validated MCP provider %s, found %d tools", self.provider_name, len(tools))

            return ToolProviderValidationResult(
                valid=True,
                provider_type="mcp",
                validated_at=datetime.now(UTC),
            )

        except TimeoutError as e:
            msg = f"Connection validation timed out after {timeout}s"
            logger.warning(_MCP_PROVIDER_LOG_TEMPLATE, self.provider_name, msg)
            raise TimeoutError(msg) from e
        except ConnectionError as e:
            msg = "Connection validation failed"
            logger.warning(_MCP_PROVIDER_LOG_TEMPLATE, self.provider_name, msg)
            raise ConnectionError(msg) from e
        except Exception as e:
            # Handle session termination and other connection errors
            if "Session terminated" in str(e) or "TaskGroup" in str(e):
                msg = "MCP session failed to establish connection - server may not be ready or incompatible"
                logger.warning(_MCP_PROVIDER_LOG_TEMPLATE, self.provider_name, msg)
                raise ConnectionError(msg) from e
            msg = f"Connection validation failed: {e}"
            logger.exception(_MCP_PROVIDER_LOG_TEMPLATE, self.provider_name, msg)
            return ToolProviderValidationResult(
                valid=False,
                provider_type="mcp",
                validated_at=datetime.now(UTC),
                error=msg,
            )

    async def get_base_tools(self) -> list[BaseTool]:
        """Get LangChain BaseTools from provider without conversion.

        Returns raw BaseTools for use in Agent Orchestrator without
        converting to Tool domain models.

        Returns:
            list[BaseTool]: Raw LangChain tools from provider

        Raises:
            ProviderError: If tool retrieval fails
            TimeoutError: If operation times out
            ConnectionError: If unable to communicate with provider

        """
        timeout = 30  # Default timeout for tool retrieval

        try:
            logger.info("Retrieving base tools from MCP provider %s", self.provider_name)

            client = await self._get_client()

            # Get tools from MCP server
            langchain_tools: list[BaseTool] = await asyncio.wait_for(client.get_tools(), timeout=timeout)

            logger.info(
                "Successfully retrieved %d base tools from MCP provider %s",
                len(langchain_tools),
                self.provider_name,
            )
            return langchain_tools

        except TimeoutError as e:
            msg = f"Tool retrieval timed out after {timeout}s"
            logger.warning(_MCP_PROVIDER_LOG_TEMPLATE, self.provider_name, msg)
            raise TimeoutError(msg) from e
        except Exception as e:
            msg = f"Tool retrieval failed: {e}"
            logger.exception(_MCP_PROVIDER_LOG_TEMPLATE, self.provider_name, msg)
            raise ConnectionError(msg) from e

    async def refresh_tools(self) -> list[Tool]:
        """Refresh and discover tools from the MCP server.

        Returns:
            list[Tool]: List of available tools with their schemas

        Raises:
            ProviderError: If tool discovery fails
            TimeoutError: If operation times out
            ConnectionError: If unable to communicate with provider

        """
        try:
            logger.info("Refreshing tools from MCP provider %s", self.provider_name)

            # Use get_base_tools to retrieve raw tools
            langchain_tools = await self.get_base_tools()

            tools = []
            self._tools_cache.clear()

            for langchain_tool in langchain_tools:
                try:
                    tool = self._convert_langchain_tool_to_tool(langchain_tool)
                    tools.append(tool)
                except (ValueError, TypeError, AttributeError) as e:
                    logger.warning("Failed to convert tool %s: %s", langchain_tool.name, e)
                    continue

            logger.info("Successfully refreshed %d tools from MCP provider %s", len(tools), self.provider_name)
            return tools

        except (TimeoutError, ConnectionError):
            # Re-raise these as they're already properly formatted
            raise
        except Exception as e:
            msg = f"Tool refresh failed: {e}"
            logger.exception(_MCP_PROVIDER_LOG_TEMPLATE, self.provider_name, msg)
            raise ConnectionError(msg) from e

    async def get_tool_schema(self, tool_name: str) -> ToolSchema:
        """Get detailed schema for a specific tool.

        Args:
            tool_name: Name of the tool to get schema for

        Returns:
            ToolSchema containing tool schema with input/output specifications

        Raises:
            ToolNotFoundError: If tool doesn't exist on provider
            ProviderError: If schema retrieval fails
            TimeoutError: If operation times out

        """
        if tool_name not in self._tools_cache:
            msg = f"Tool '{tool_name}' not found in provider {self.provider_name}."
            logger.warning(msg)
            raise ToolNotFoundError(msg)

        try:
            cached_tool = self._tools_cache[tool_name]
            langchain_tool = cached_tool["langchain_tool"]

            # Build comprehensive schema
            input_schema = cached_tool.get("schema", {})

            tool_schema = ToolSchema(
                name=tool_name,
                description=langchain_tool.description,
                input_schema=input_schema,
                output_schema=None,  # MCP tools don't typically define output schemas
                examples=None,  # Could be added from tool examples if available
            )

            logger.debug("Retrieved schema for tool %s from MCP provider %s", tool_name, self.provider_name)
            return tool_schema

        except Exception as e:
            msg = f"Failed to get schema for tool '{tool_name}': {e}"
            logger.exception(_MCP_PROVIDER_LOG_TEMPLATE, self.provider_name, msg)
            raise ConnectionError(msg) from e

    async def validate_tool(self, tool_name: str, parameters: dict[str, Any] | None = None) -> ToolValidationResult:
        """Validate tool functionality and server communication.

        This method validates that the tool can be called and communicates properly
        with the provider. It performs a dry-run validation without executing the tool.

        Args:
            tool_name: Name of the tool to validate
            parameters: Optional minimal parameters for validation

        Returns:
            ToolValidationResult containing validation details

        Raises:
            ToolNotFoundError: If tool doesn't exist on provider
            ProviderError: If tool validation fails due to provider issues
            TimeoutError: If validation times out

        """
        if tool_name not in self._tools_cache:
            msg = f"Tool '{tool_name}' not found in provider {self.provider_name}"
            logger.warning(msg)
            raise ToolNotFoundError(msg)

        try:
            logger.info("Validating tool %s from MCP provider %s", tool_name, self.provider_name)

            cached_tool = self._tools_cache[tool_name]
            langchain_tool = cached_tool["langchain_tool"]
            test_params = parameters or {}

            # Perform schema and connectivity validation
            schema_valid, schema_error = self._validate_tool_schema(langchain_tool, test_params)
            connectivity_valid, connectivity_error = await self._validate_tool_connectivity()

            # Build result
            success = schema_valid and connectivity_valid
            error_message = self._build_validation_error_message(
                schema_valid=schema_valid,
                schema_error=schema_error,
                connectivity_valid=connectivity_valid,
                connectivity_error=connectivity_error,
            )

            result = ToolValidationResult(
                success=success,
                duration_ms=0,  # Not measuring actual execution time
                status="success" if success else "failure",
                message=error_message or f"Tool '{tool_name}' validation completed successfully",
                validated_at=datetime.now(UTC),
            )

            self._log_validation_result(tool_name, success=success)
            return result

        except TimeoutError as e:
            msg = "Tool validation timed out after 10s"
            logger.warning(_MCP_PROVIDER_LOG_TEMPLATE, self.provider_name, msg)
            raise TimeoutError(msg) from e
        except Exception as e:
            msg = f"Tool validation failed: {e}"
            logger.exception(_MCP_PROVIDER_LOG_TEMPLATE, self.provider_name, msg)
            raise ConnectionError(msg) from e

    def _validate_tool_schema(self, langchain_tool: BaseTool, test_params: dict[str, Any]) -> tuple[bool, str | None]:
        """Validate tool schema.

        Args:
            langchain_tool: The langchain tool object
            test_params: Parameters to validate

        Returns:
            tuple: (is_valid, error_message)

        """
        if not langchain_tool.args_schema:
            return True, None

        try:
            # Handle both BaseModel classes and dict schemas
            if hasattr(langchain_tool.args_schema, "model_validate"):
                # Pydantic BaseModel
                langchain_tool.args_schema.model_validate(test_params)
            else:
                # Other schema types - skip validation
                pass
            return True, None
        except (ValueError, TypeError, AttributeError) as e:
            return False, str(e)

    async def _validate_tool_connectivity(self) -> tuple[bool, str | None]:
        """Validate tool connectivity.

        Returns:
            tuple: (is_valid, error_message)

        """
        try:
            client = await self._get_client()
            timeout = 10  # Shorter timeout for validation
            await asyncio.wait_for(client.get_tools(), timeout=timeout)
            return True, None
        except (TimeoutError, ConnectionError, OSError) as e:
            return False, str(e)

    def _build_validation_error_message(
        self,
        *,
        schema_valid: bool,
        schema_error: str | None,
        connectivity_valid: bool,
        connectivity_error: str | None,
    ) -> str | None:
        """Build validation error message.

        Args:
            schema_valid: Whether schema validation passed
            schema_error: Schema validation error
            connectivity_valid: Whether connectivity check passed
            connectivity_error: Connectivity error

        Returns:
            Combined error message or None if all validations passed

        """
        if schema_valid and connectivity_valid:
            return None

        error_parts = []
        if not schema_valid:
            error_parts.append(f"Schema validation failed: {schema_error}")
        if not connectivity_valid:
            error_parts.append(f"Connectivity check failed: {connectivity_error}")
        return "; ".join(error_parts)

    def _log_validation_result(self, tool_name: str, *, success: bool) -> None:
        """Log validation result.

        Args:
            tool_name: Name of the tool
            success: Whether validation succeeded

        """
        log_level = logging.INFO if success else logging.WARNING
        status_msg = "success" if success else "failed"
        logger.log(
            log_level,
            "Tool validation for %s from MCP provider %s: %s",
            tool_name,
            self.provider_name,
            status_msg,
        )

    def _convert_langchain_tool_to_tool(self, langchain_tool: BaseTool) -> Tool:
        """Convert a langchain tool to our Tool model.

        Args:
            langchain_tool: The langchain tool object

        Returns:
            Tool: Converted tool object

        """
        tool_name = langchain_tool.name
        namespaced_name = f"{self.provider_name}::{tool_name}"

        # Extract and cache schema
        schema = self._extract_tool_schema(langchain_tool)
        self._tools_cache[tool_name] = {
            "langchain_tool": langchain_tool,
            "schema": schema,
        }

        # Convert schema to parameters
        parameters = self._create_tool_parameters(schema)

        # Create tool object
        tool = Tool(
            id=uuid4(),
            provider_id=self.provider_id,
            name=tool_name,
            namespaced_name=namespaced_name,
            description=langchain_tool.description,
            parameters=parameters,
            status=ToolStatus.AVAILABLE,
            last_refreshed_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            created_by=self.provider_id,
            updated_by=self.provider_id,
        )

        # Update parameter tool_id references
        for parameter in parameters:
            parameter.tool_id = tool.id

        return tool

    def _extract_tool_schema(self, langchain_tool: BaseTool) -> dict[str, Any]:
        """Extract schema from langchain tool.

        Args:
            langchain_tool: The langchain tool object

        Returns:
            dict: Tool schema

        """
        schema: dict[str, Any] = {}
        if langchain_tool.args_schema:
            if hasattr(langchain_tool.args_schema, "model_json_schema"):
                schema = langchain_tool.args_schema.model_json_schema()
            elif isinstance(langchain_tool.args_schema, dict):
                schema = langchain_tool.args_schema

        return schema

    def _create_tool_parameters(self, schema: dict[str, Any]) -> list[ToolParameter]:
        """Create ToolParameter objects from schema.

        Args:
            schema: Tool schema dictionary

        Returns:
            list[ToolParameter]: List of tool parameters

        """
        parameters: list[ToolParameter] = []
        if not schema:
            return parameters

        properties = schema.get("properties", {})
        required_params = schema.get("required", [])

        for param_name, param_def in properties.items():
            parameter = self._create_tool_parameter(param_name, param_def, required_params)
            parameters.append(parameter)

        return parameters

    def _create_tool_parameter(
        self, param_name: str, param_def: dict[str, Any], required_params: list[str]
    ) -> ToolParameter:
        """Create a single ToolParameter from definition.

        Args:
            param_name: Parameter name
            param_def: Parameter definition
            required_params: List of required parameter names

        Returns:
            ToolParameter: Created parameter

        """
        param_type = self._convert_json_type_to_tool_parameter_type(param_def.get("type", "string"))

        # Handle default_value - must be dict[str, Any] | None
        default_val = param_def.get("default")
        if default_val is not None and not isinstance(default_val, dict):
            default_val = {"value": default_val}

        # Handle example_value - must be dict[str, Any] | None
        example_val = param_def.get("examples", [None])[0] if param_def.get("examples") else None
        if example_val is not None and not isinstance(example_val, dict):
            example_val = {"value": example_val}

        return ToolParameter(
            id=uuid4(),
            tool_id=uuid4(),  # Will be set when Tool is created
            name=param_name,
            type=param_type,
            description=param_def.get("description") or "",
            required=param_name in required_params,
            default_value=default_val,
            example_value=example_val,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            created_by=self.provider_id,
            updated_by=self.provider_id,
        )

    def _convert_json_type_to_tool_parameter_type(self, json_type: str) -> ToolParameterType:
        """Convert JSON schema type to ToolParameterType enum.

        Args:
            json_type: JSON schema type string

        Returns:
            ToolParameterType enum value

        """
        type_mapping = {
            "string": ToolParameterType.STRING,
            "number": ToolParameterType.NUMBER,
            "integer": ToolParameterType.NUMBER,
            "boolean": ToolParameterType.BOOLEAN,
            "object": ToolParameterType.OBJECT,
            "array": ToolParameterType.ARRAY,
        }

        return type_mapping.get(json_type, ToolParameterType.STRING)

    async def close(self) -> None:
        """Close the MCP client connection.

        This method should be called when the provider is no longer needed
        to properly clean up resources.
        """
        if self._client:
            try:
                # The langchain MCP client doesn't have an explicit close method,
                # but we can clear our reference and cache
                self._client = None
                self._tools_cache.clear()
                logger.info("Closed MCP client for provider %s", self.provider_name)
            except (AttributeError, RuntimeError) as e:
                logger.warning("Error closing MCP client for provider %s: %s", self.provider_name, e)
