"""Contract tests for GET /api/v1/tool-providers endpoint.

Tests keyset pagination, bracket filter notation, and OpenAPI schema compliance.
"""

import pytest
from httpx import AsyncClient

from nexus.tool_manager.models import ToolProvider


class TestToolProvidersListContract:
    """Contract tests for tool providers list endpoint."""

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_basic_success(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test basic GET /api/v1/tool-providers returns 200."""
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must return JSON with resources array
        data = response.json()
        assert "resources" in data
        assert isinstance(data["resources"], list)

        # Contract: Must return the test providers
        assert len(data["resources"]) == 6
        provider_names = [p["name"] for p in data["resources"]]
        expected_names = [
            "Alpha Provider",
            "Beta Provider",
            "Gamma Provider",
            "Delta Provider",
            "Echo Provider",
            "Foxtrot Provider",
        ]
        for name in expected_names:
            assert name in provider_names

    @pytest.mark.asyncio
    async def test_list_providers_pagination_contract(
        self, base_client_with_provider_factory: AsyncClient, multiple_test_providers: list[ToolProvider]
    ) -> None:
        """Test pagination parameters are accepted and response format is correct."""
        # Test with limit smaller than total count to ensure pagination works
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers", params={"limit": "3"})

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must include pagination metadata
        data = response.json()
        assert "next" in data
        assert "prev" in data
        assert "resources" in data

        # Contract: Must respect limit parameter
        assert len(data["resources"]) <= 3

        # Contract: Should have next cursor since we have more data
        if len(multiple_test_providers) > 3:
            assert data["next"] is not None

        # Test pagination with cursor
        if data["next"]:
            next_response = await base_client_with_provider_factory.get(
                "/api/v1/tool-providers", params={"limit": "3", "cursor": data["next"]}
            )
            assert next_response.status_code == 200
            next_data = next_response.json()
            assert "resources" in next_data

            # Should get different resources
            first_page_ids = {p["id"] for p in data["resources"]}
            second_page_ids = {p["id"] for p in next_data["resources"]}

            assert first_page_ids.isdisjoint(second_page_ids)

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_bracket_filters_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test bracket filter notation is accepted."""
        # Test filtering by enabled status
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers", params={"enabled[eq]": "true"})
        assert response.status_code == 200
        data = response.json()
        assert "resources" in data

        # All returned providers should be enabled
        for provider in data["resources"]:
            assert provider["enabled"] is True

        # Should return 4 enabled providers (Alpha, Gamma, Delta, Foxtrot)
        assert len(data["resources"]) == 4

        # Test filtering by provider type in configuration
        mcp_response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"configuration.provider_type[eq]": "mcp"}
        )
        assert mcp_response.status_code == 200
        mcp_data = mcp_response.json()

        # All returned providers should have mcp provider_type
        for provider in mcp_data["resources"]:
            assert provider["configuration"]["provider_type"] == "mcp"

        # Should return 6 MCP providers (Alpha, Beta, Gamma, Delta, Echo, Foxtrot)
        assert len(mcp_data["resources"]) == 6

        # Test name contains filter
        alpha_response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"name[contains]": "Alpha"}
        )
        assert alpha_response.status_code == 200
        alpha_data = alpha_response.json()
        assert len(alpha_data["resources"]) == 1
        assert alpha_data["resources"][0]["name"] == "Alpha Provider"

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_include_total_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test include_total parameter returns total count."""
        response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"include_total": "true"}
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must include total field when requested
        data = response.json()
        assert "total" in data
        assert isinstance(data["total"], int)
        assert data["total"] == 6  # Should match our test providers

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_response_schema_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test response matches OpenAPI specification schema."""
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must match expected schema structure
        data = response.json()
        assert "resources" in data
        assert len(data["resources"]) > 0

        # Each provider resource must have required fields per OpenAPI spec
        for provider in data["resources"]:
            required_fields = [
                "id",
                "name",
                "description",
                "configuration",
                "enabled",
                "status",
                "last_validated_at",
                "validation_error",
                "created_at",
                "updated_at",
                "created_by",
                "updated_by",
            ]
            for field in required_fields:
                assert field in provider, f"Missing required field: {field}"

            # Verify data types
            assert isinstance(provider["id"], str)
            assert isinstance(provider["name"], str)
            assert isinstance(provider["configuration"], dict)
            assert isinstance(provider["enabled"], bool)
            assert isinstance(provider["status"], str)

    @pytest.mark.asyncio
    async def test_list_providers_invalid_parameters_contract(
        self, base_client_with_provider_factory: AsyncClient
    ) -> None:
        """Test validation of query parameters."""
        # Test with invalid limit parameter
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers", params={"limit": "invalid"})

        # Contract: Must return 422 Unprocessable Entity for invalid parameters
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_providers_empty_result_contract(self, base_client_with_provider_factory: AsyncClient) -> None:
        """Test response format when no providers exist."""
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers")

        # Contract: Must return 200 even for empty results
        assert response.status_code == 200

        # Contract: Must return empty array, not null
        data = response.json()
        assert "resources" in data
        assert isinstance(data["resources"], list)

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_cursor_format_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test cursor token format in response."""
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers", params={"limit": "1"})

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Cursor tokens must be strings when present
        data = response.json()
        if data.get("next"):
            assert isinstance(data["next"], str)
            assert len(data["next"]) > 0  # Cursor should not be empty
        if data.get("prev"):
            assert isinstance(data["prev"], str)

        # With 6 providers and limit=1, should definitely have next cursor
        assert data["next"] is not None
        assert len(data["resources"]) == 1

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_sorting_by_name_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test sorting providers by name."""
        # Test ascending sort
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers", params={"sort": "name"})
        assert response.status_code == 200

        data = response.json()
        assert len(data["resources"]) == 6

        # Names should be in alphabetical order
        names = [p["name"] for p in data["resources"]]
        assert names == sorted(names)
        assert names[0] == "Alpha Provider"
        assert names[-1] == "Gamma Provider"  # Last alphabetically

        # Test descending sort
        desc_response = await base_client_with_provider_factory.get("/api/v1/tool-providers", params={"sort": "-name"})
        assert desc_response.status_code == 200

        desc_data = desc_response.json()
        desc_names = [p["name"] for p in desc_data["resources"]]
        assert desc_names == sorted(names, reverse=True)

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_sorting_by_created_at_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test sorting providers by creation date."""
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers", params={"sort": "created_at"})
        assert response.status_code == 200

        data = response.json()
        created_dates = [p["created_at"] for p in data["resources"]]
        assert created_dates == sorted(created_dates)

        # Test descending sort (newest first)
        desc_response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"sort": "-created_at"}
        )
        assert desc_response.status_code == 200

        desc_data = desc_response.json()
        desc_dates = [p["created_at"] for p in desc_data["resources"]]
        assert desc_dates == sorted(created_dates, reverse=True)

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_combined_filter_and_sort_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test combining filters and sorting."""
        # Filter enabled providers and sort by name
        response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"enabled[eq]": "true", "sort": "name"}
        )
        assert response.status_code == 200

        data = response.json()
        assert len(data["resources"]) == 4  # Alpha, Gamma, Delta, Foxtrot

        # Should be enabled and sorted
        for provider in data["resources"]:
            assert provider["enabled"] is True

        names = [p["name"] for p in data["resources"]]
        assert names == sorted(names)

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_combined_filter_and_sort_contract_disabled(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test combining filters and sorting."""
        # Filter enabled providers and sort by name
        response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"enabled[eq]": "false", "sort": "-name"}
        )
        assert response.status_code == 200

        data = response.json()
        assert len(data["resources"]) == 2  # Beta, Echo

        # Should be enabled and sorted
        for provider in data["resources"]:
            assert provider["enabled"] is False

        names = [p["name"] for p in data["resources"]]
        assert names == sorted(names, reverse=True)

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_filter_by_multiple_criteria_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test filtering by multiple criteria."""
        # Filter enabled MCP providers
        response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"enabled[eq]": "true", "configuration.provider_type[eq]": "mcp"}
        )
        assert response.status_code == 200

        data = response.json()
        assert len(data["resources"]) == 4  # Alpha, Gamma, Delta and Foxtrot

        for provider in data["resources"]:
            assert provider["enabled"] is True
            assert provider["configuration"]["provider_type"] == "mcp"
            assert provider["name"] in ["Alpha Provider", "Gamma Provider", "Delta Provider", "Foxtrot Provider"]

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_pagination_with_filters_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test pagination works correctly with filters."""
        # Get enabled providers with pagination
        response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"enabled[eq]": "true", "limit": "2"}
        )
        assert response.status_code == 200

        data = response.json()
        assert len(data["resources"]) == 2
        assert data["next"] is not None  # Should have more enabled providers

        # All results should be enabled
        for provider in data["resources"]:
            assert provider["enabled"] is True

        # Get next page
        next_response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"enabled[eq]": "true", "limit": "2", "cursor": data["next"]}
        )
        assert next_response.status_code == 200

        next_data = next_response.json()
        for provider in next_data["resources"]:
            assert provider["enabled"] is True

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_edge_cases_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test edge cases and boundary conditions."""
        # Test with limit = 0 (should return error)
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers", params={"limit": "0"})
        assert response.status_code == 422  # Validation error

        # Test with very large limit (should be capped)
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers", params={"limit": "1000"})
        assert response.status_code in [200, 422]  # Either capped or validation error

        # Test with invalid cursor
        response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"cursor": "invalid-cursor"}
        )
        assert response.status_code in [200, 422]  # Either ignored or validation error

        # Test with invalid sort field
        response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"sort": "invalid_field"}
        )
        assert response.status_code in [200, 422]  # Either ignored or validation error

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_filter_no_results_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test filtering that returns no results."""
        # Filter for non-existent provider type
        response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"configuration.provider_type[eq]": "nonexistent"}
        )
        assert response.status_code == 200

        data = response.json()
        assert "resources" in data
        assert len(data["resources"]) == 0
        assert isinstance(data["resources"], list)

        # Should still include pagination metadata
        assert "next" in data
        assert "prev" in data
        assert data["next"] is None
        assert data["prev"] is None

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_complex_configuration_filter_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test filtering by nested configuration properties."""
        # Filter MCP providers by base_url containing 'alpha'
        response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers",
            params={"configuration.provider_type[eq]": "mcp", "description[contains]": "First"},
        )
        assert response.status_code == 200

        data = response.json()
        assert len(data["resources"]) == 1
        assert data["resources"][0]["name"] == "Alpha Provider"
        assert "first" in data["resources"][0]["description"].lower()

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_include_total_with_filters_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test include_total works correctly with filters."""
        # Get total for all providers
        all_response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"include_total": "true"}
        )
        assert all_response.status_code == 200
        all_data = all_response.json()
        assert all_data["total"] == 6

        # Get total for enabled providers only
        enabled_response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"enabled[eq]": "true", "include_total": "true"}
        )
        assert enabled_response.status_code == 200
        enabled_data = enabled_response.json()
        assert enabled_data["total"] == 4  # 4 enabled providers

        # Total should be accurate even with pagination
        paginated_response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"enabled[eq]": "true", "include_total": "true", "limit": "2"}
        )
        assert paginated_response.status_code == 200
        paginated_data = paginated_response.json()
        assert paginated_data["total"] == 4  # Total count, not page count
        assert len(paginated_data["resources"]) == 2  # Page size

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_filter_invalid_status_enum_contract(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test filtering with invalid ProviderStatus enum value returns 400."""
        # Filter with invalid status value
        response = await base_client_with_provider_factory.get(
            "/api/v1/tool-providers", params={"status[eq]": "nonexistent"}
        )

        # Contract: Must return 422 Unprocessable Entity for invalid enum value
        assert response.status_code == 422

        # Contract: Must return error details
        data = response.json()
        assert "detail" in data
        assert "Invalid value 'nonexistent'" in data["detail"]
        assert "Valid values are:" in data["detail"]

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_list_providers_configuration_eager_loading(
        self,
        base_client_with_provider_factory: AsyncClient,
    ) -> None:
        """Test that configuration is correctly loaded and typed in list_providers endpoint.

        This integration test verifies that the list_providers endpoint returns
        strongly-typed configuration objects rather than raw JSON, ensuring
        proper deserialization and type safety for API consumers.
        """
        # Make HTTP request to list providers - this is end-to-end testing
        response = await base_client_with_provider_factory.get("/api/v1/tool-providers")

        # Verify successful response
        assert response.status_code == 200
        data = response.json()
        assert "resources" in data
        assert isinstance(data["resources"], list)
        assert len(data["resources"]) == 6  # Should return all test providers

        # Find our Alpha Provider in the response to verify configuration details
        alpha_provider = None
        for provider_data in data["resources"]:
            if provider_data["name"] == "Alpha Provider":
                alpha_provider = provider_data
                break

        assert alpha_provider is not None, "Alpha Provider not found in response"

        # Verify configuration is included and properly typed (proving eager loading/transformation)
        assert "configuration" in alpha_provider, "Provider configuration should be included in response"
        assert isinstance(alpha_provider["configuration"], dict), "Configuration should be a dictionary object"

        # Verify configuration structure matches expected MCP provider format
        config = alpha_provider["configuration"]
        assert "provider_type" in config, "Configuration should include provider_type"
        assert config["provider_type"] == "mcp", "Provider type should be 'mcp'"

        # Verify MCP-specific fields are present and properly typed
        expected_mcp_fields = ["base_url", "api_key"]
        for field in expected_mcp_fields:
            assert field in config, f"MCP configuration should include {field}"
            assert isinstance(config[field], str), f"MCP {field} should be a string"

        # Verify configuration values match expected test data
        assert config["base_url"] == "https://alpha.example.com"
        assert config["api_key"] == "alpha-key"

        # Verify ALL providers in the list have properly typed configurations
        for provider in data["resources"]:
            assert "configuration" in provider, f"Provider {provider['name']} should have configuration"
            assert isinstance(provider["configuration"], dict), (
                f"Provider {provider['name']} configuration should be dict"
            )
            assert "provider_type" in provider["configuration"], (
                f"Provider {provider['name']} should have provider_type"
            )
            assert provider["configuration"]["provider_type"] == "mcp", (
                f"Provider {provider['name']} should be MCP type"
            )

            # Verify all have the expected MCP fields
            for field in expected_mcp_fields:
                assert field in provider["configuration"], f"Provider {provider['name']} should have {field}"
                assert isinstance(provider["configuration"][field], str), (
                    f"Provider {provider['name']} {field} should be string"
                )
