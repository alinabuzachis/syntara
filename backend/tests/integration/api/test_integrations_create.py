"""Contract tests for POST /api/v1/integrations."""

from uuid import uuid4

from httpx import AsyncClient

BASE_URL = "/api/v1/integrations"


def _mcp_payload(name: str | None = None) -> dict[str, object]:
    return {
        "name": name or f"intg-{uuid4().hex[:8]}",
        "integration_type": "mcp_server",
        "configuration": {
            "integration_type": "mcp_server",
            "base_url": "https://mcp.example.com",
        },
    }


def _llm_payload(name: str | None = None) -> dict[str, object]:
    return {
        "name": name or f"llm-{uuid4().hex[:8]}",
        "integration_type": "llm_provider",
        "configuration": {
            "integration_type": "llm_provider",
            "base_url": "http://localhost:11434",
            "provider_hint": "custom",
        },
    }


def _aap_payload(name: str | None = None) -> dict[str, object]:
    return {
        "name": name or f"aap-{uuid4().hex[:8]}",
        "integration_type": "aap_gateway",
        "configuration": {
            "integration_type": "aap_gateway",
            "gateway_url": "https://gw.example.com",
        },
    }


class TestIntegrationsCreate:
    """Contract tests for POST /api/v1/integrations."""

    async def test_create_mcp_server_returns_201(self, auth_client: AsyncClient) -> None:
        """Creating an mcp_server integration returns 201 with expected fields."""
        payload = _mcp_payload()
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == payload["name"]
        assert data["integration_type"] == "mcp_server"
        assert "id" in data
        assert data["validation_status"] == "unknown"

    async def test_create_llm_provider_returns_201(self, auth_client: AsyncClient) -> None:
        """Creating an llm_provider integration returns 201."""
        response = await auth_client.post(BASE_URL, json=_llm_payload())
        assert response.status_code == 201
        data = response.json()
        assert data["integration_type"] == "llm_provider"
        assert data["validation_status"] == "unknown"

    async def test_create_aap_gateway_returns_201(self, auth_client: AsyncClient) -> None:
        """Creating an aap_gateway integration returns 201."""
        response = await auth_client.post(BASE_URL, json=_aap_payload())
        assert response.status_code == 201
        data = response.json()
        assert data["integration_type"] == "aap_gateway"
        assert data["validation_status"] == "unknown"

    async def test_create_response_includes_required_fields(self, auth_client: AsyncClient) -> None:
        """Create response includes id, name, integration_type, configuration, validation_status."""
        response = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert response.status_code == 201
        data = response.json()
        for field in ("id", "name", "integration_type", "configuration", "validation_status"):
            assert field in data, f"Missing field: {field}"

    async def test_create_configuration_echoed_in_response(self, auth_client: AsyncClient) -> None:
        """The configuration block is returned in the response."""
        payload = _mcp_payload()
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 201
        config = response.json()["configuration"]
        assert config["integration_type"] == "mcp_server"
        assert "base_url" in config

    async def test_create_mcp_configuration_contains_no_api_key(self, auth_client: AsyncClient) -> None:
        """MCP configuration response must not expose api_key (AC3: no plaintext credentials)."""
        response = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert response.status_code == 201
        config = response.json()["configuration"]
        assert "api_key" not in config

    async def test_create_mcp_rejects_api_key_in_configuration(self, auth_client: AsyncClient) -> None:
        """Submitting api_key inside mcp_server configuration is rejected (extra='forbid')."""
        payload = {
            "name": f"mcp-apikey-{uuid4().hex[:8]}",
            "integration_type": "mcp_server",
            "configuration": {
                "integration_type": "mcp_server",
                "base_url": "https://mcp.example.com",
                "api_key": "should-not-be-accepted",
            },
        }
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 422

    async def test_create_duplicate_name_returns_409(self, auth_client: AsyncClient) -> None:
        """Creating two integrations with the same name returns 409 on the second."""
        name = f"dup-{uuid4().hex[:8]}"
        first = await auth_client.post(BASE_URL, json=_mcp_payload(name))
        assert first.status_code == 201

        second = await auth_client.post(BASE_URL, json=_mcp_payload(name))
        assert second.status_code == 409

    async def test_create_missing_name_returns_422(self, auth_client: AsyncClient) -> None:
        """Omitting name returns 422."""
        payload = {
            "integration_type": "mcp_server",
            "configuration": {"integration_type": "mcp_server", "base_url": "https://mcp.example.com"},
        }
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 422

    async def test_create_missing_configuration_returns_422(self, auth_client: AsyncClient) -> None:
        """Omitting configuration returns 422."""
        payload = {
            "name": f"no-config-{uuid4().hex[:8]}",
            "integration_type": "mcp_server",
        }
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 422

    async def test_create_name_too_long_returns_422(self, auth_client: AsyncClient) -> None:
        """Name longer than 255 characters returns 422."""
        payload = _mcp_payload("x" * 256)
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 422

    async def test_create_missing_discriminator_returns_422(self, auth_client: AsyncClient) -> None:
        """Configuration without integration_type discriminator returns 422."""
        payload = {
            "name": f"no-disc-{uuid4().hex[:8]}",
            "integration_type": "mcp_server",
            "configuration": {"base_url": "https://mcp.example.com"},
        }
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 422

    async def test_create_type_mismatch_returns_422(self, auth_client: AsyncClient) -> None:
        """integration_type and configuration.integration_type mismatch returns 422."""
        payload = {
            "name": f"mismatch-{uuid4().hex[:8]}",
            "integration_type": "mcp_server",
            "configuration": {
                "integration_type": "llm_provider",
                "base_url": "http://localhost:11434",
                "provider_hint": "custom",
            },
        }
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 422

    async def test_create_aap_gateway_rejects_http(self, auth_client: AsyncClient) -> None:
        """aap_gateway with http (non-https) gateway_url is rejected."""
        payload = {
            "name": f"aap-http-{uuid4().hex[:8]}",
            "integration_type": "aap_gateway",
            "configuration": {
                "integration_type": "aap_gateway",
                "gateway_url": "http://gw.example.com",
            },
        }
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 422

    async def test_create_with_discovered_tools_creates_tool_records(self, auth_client: AsyncClient) -> None:
        """Providing discovered_tools creates Tool records linked to the integration."""
        payload = _mcp_payload()
        payload["discovered_tools"] = [
            {"name": "tool_a", "description": "First tool", "enabled": True},
            {"name": "tool_b", "description": "Second tool", "enabled": True},
        ]
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 201
        data = response.json()
        integration_id = data["id"]
        integration_name = data["name"]

        tools_response = await auth_client.get("/api/v1/tool_manager/tools", params={"integration_id": integration_id})
        assert tools_response.status_code == 200
        tools = tools_response.json()["resources"]
        assert len(tools) == 2
        tools_by_name = {t["name"]: t for t in tools}
        assert set(tools_by_name.keys()) == {"tool_a", "tool_b"}
        assert tools_by_name["tool_a"]["description"] == "First tool"
        assert tools_by_name["tool_b"]["description"] == "Second tool"
        assert tools_by_name["tool_a"]["namespaced_name"] == f"{integration_name}::tool_a"
        assert tools_by_name["tool_b"]["namespaced_name"] == f"{integration_name}::tool_b"

    async def test_create_with_discovered_tools_respects_enabled_state(self, auth_client: AsyncClient) -> None:
        """Tools created from discovered_tools respect the enabled/disabled selections."""
        payload = _mcp_payload()
        payload["discovered_tools"] = [
            {"name": "enabled_tool", "description": "Should be enabled", "enabled": True},
            {"name": "disabled_tool", "description": "Should be disabled", "enabled": False},
        ]
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 201
        integration_id = response.json()["id"]

        tools_response = await auth_client.get("/api/v1/tool_manager/tools", params={"integration_id": integration_id})
        tools = {t["name"]: t for t in tools_response.json()["resources"]}
        assert tools["enabled_tool"]["enabled"] is True
        assert tools["disabled_tool"]["enabled"] is False

    async def test_create_with_discovered_tools_sets_refresh_status(self, auth_client: AsyncClient) -> None:
        """When discovered_tools are provided, refresh_status is set to available."""
        payload = _mcp_payload()
        payload["discovered_tools"] = [
            {"name": "some_tool", "enabled": True},
        ]
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["refresh_status"] == "available"
        assert data["last_refreshed_at"] is not None

    async def test_create_without_discovered_tools_has_no_refresh_status(self, auth_client: AsyncClient) -> None:
        """When discovered_tools are omitted, refresh_status remains null."""
        response = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert response.status_code == 201
        data = response.json()
        assert data["refresh_status"] is None
        assert data["last_refreshed_at"] is None

    async def test_create_with_empty_discovered_tools_has_no_refresh_status(self, auth_client: AsyncClient) -> None:
        """When discovered_tools is an empty list, no tools are created and refresh_status stays null."""
        payload = _mcp_payload()
        payload["discovered_tools"] = []
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["refresh_status"] is None

    async def test_create_with_discovered_tools_with_parameters(self, auth_client: AsyncClient) -> None:
        """Tools with parameters are created with ToolParameter records."""
        payload = _mcp_payload()
        payload["discovered_tools"] = [
            {
                "name": "param_tool",
                "description": "Tool with params",
                "enabled": True,
                "parameters": [
                    {"name": "query", "type": "string", "description": "Search query", "required": True},
                    {"name": "limit", "type": "integer", "description": "Max results", "required": False},
                ],
            },
        ]
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 201
        integration_id = response.json()["id"]

        tools_response = await auth_client.get("/api/v1/tool_manager/tools", params={"integration_id": integration_id})
        tools = tools_response.json()["resources"]
        assert len(tools) == 1
        assert tools[0]["name"] == "param_tool"

    async def test_create_with_duplicate_tool_names_returns_422(self, auth_client: AsyncClient) -> None:
        """Duplicate tool names in discovered_tools are rejected."""
        payload = _mcp_payload()
        payload["discovered_tools"] = [
            {"name": "same_name", "enabled": True},
            {"name": "same_name", "enabled": False},
        ]
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 422

    async def test_create_discovered_tools_rejected_for_llm_provider(self, auth_client: AsyncClient) -> None:
        """discovered_tools is rejected for non-MCP integration types."""
        payload = _llm_payload()
        payload["discovered_tools"] = [{"name": "some_tool", "enabled": True}]
        response = await auth_client.post(BASE_URL, json=payload)
        assert response.status_code == 422

    async def test_create_requires_authentication(self, base_client: AsyncClient) -> None:
        """POST requires authentication."""
        response = await base_client.post(BASE_URL, json=_mcp_payload())
        assert response.status_code == 401
