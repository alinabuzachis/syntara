"""Contract tests for OpenAPI schema structure validation.

These tests validate that the OpenAPI specification in shared-resources.openapi.yaml
matches the expected structure and contains all required schemas and properties.
"""

from pathlib import Path
from typing import Any

import pytest
import yaml


class TestOpenAPISchemaStructure:
    """Test OpenAPI schema structure and composition."""

    @pytest.fixture
    def openapi_spec(self) -> dict[str, Any]:
        """Load the OpenAPI specification."""
        # Get the absolute path relative to this test file to work in any environment
        test_file_dir = Path(__file__).parent
        spec_path = test_file_dir / "../../../specs/006-create-shared-resources/contracts/shared-resources.openapi.yaml"
        spec_path = spec_path.resolve()  # Resolve to absolute path

        if not spec_path.exists():
            pytest.skip(f"OpenAPI spec not found at {spec_path}")

        with Path.open(spec_path) as f:
            return yaml.safe_load(f)  # type: ignore[no-any-return]

    def test_base_resource_schema_structure(self, openapi_spec: dict[str, Any]) -> None:
        """Verify BaseResource schema has correct structure."""
        schemas = openapi_spec["components"]["schemas"]
        base_resource = schemas["BaseResource"]

        # Required fields
        assert "id" in base_resource["properties"]
        assert "createdAt" in base_resource["properties"]
        assert "updatedAt" in base_resource["properties"]
        assert "labels" in base_resource["properties"]

        # Field types and constraints
        assert base_resource["properties"]["id"]["format"] == "uuid"
        assert base_resource["properties"]["id"]["readOnly"] is True
        assert base_resource["properties"]["createdAt"]["format"] == "date-time"
        assert base_resource["properties"]["createdAt"]["readOnly"] is True
        assert base_resource["properties"]["updatedAt"]["format"] == "date-time"
        assert base_resource["properties"]["updatedAt"]["readOnly"] is True

        # Labels as key-value pairs (object with additionalProperties)
        labels_prop = base_resource["properties"]["labels"]
        assert labels_prop["type"] == "object"
        assert "additionalProperties" in labels_prop
        assert labels_prop["additionalProperties"]["type"] == "string"

    def test_schema_composition_with_allof(self, openapi_spec: dict[str, Any]) -> None:
        """Verify schemas properly use allOf for composition."""
        schemas = openapi_spec["components"]["schemas"]

        # NamedResource extends BaseResource
        named_resource = schemas["NamedResource"]
        assert "allOf" in named_resource
        base_refs = [item for item in named_resource["allOf"] if "$ref" in item]
        assert any("BaseResource" in ref["$ref"] for ref in base_refs)

        # SoftDeletableResource extends BaseResource
        soft_deletable = schemas["SoftDeletableResource"]
        assert "allOf" in soft_deletable
        base_refs = [item for item in soft_deletable["allOf"] if "$ref" in item]
        assert any("BaseResource" in ref["$ref"] for ref in base_refs)

        # UserOwnedResource extends BaseResource
        user_owned = schemas["UserOwnedResource"]
        assert "allOf" in user_owned
        base_refs = [item for item in user_owned["allOf"] if "$ref" in item]
        assert any("BaseResource" in ref["$ref"] for ref in base_refs)

        # Resource composes all three extensions
        resource = schemas["Resource"]
        assert "allOf" in resource
        refs = [item["$ref"] for item in resource["allOf"] if "$ref" in item]
        assert any("NamedResource" in ref for ref in refs)
        assert any("SoftDeletableResource" in ref for ref in refs)
        assert any("UserOwnedResource" in ref for ref in refs)

    def test_named_resource_properties(self, openapi_spec: dict[str, Any]) -> None:
        """Verify NamedResource has name and description properties."""
        schemas = openapi_spec["components"]["schemas"]
        named_resource = schemas["NamedResource"]

        # Find the object schema within allOf
        object_schema = next(item for item in named_resource["allOf"] if "properties" in item)

        assert "name" in object_schema["properties"]
        assert "description" in object_schema["properties"]

        name_prop = object_schema["properties"]["name"]
        assert name_prop["type"] == "string"
        assert name_prop["minLength"] == 1
        assert name_prop["maxLength"] == 255

        desc_prop = object_schema["properties"]["description"]
        assert desc_prop["type"] == "string"
        assert desc_prop.get("nullable") is True
        assert desc_prop["maxLength"] == 2000

    def test_soft_deletable_properties(self, openapi_spec: dict[str, Any]) -> None:
        """Verify SoftDeletableResource has deletion tracking properties."""
        schemas = openapi_spec["components"]["schemas"]
        soft_deletable = schemas["SoftDeletableResource"]

        # Find the object schema within allOf
        object_schema = next(item for item in soft_deletable["allOf"] if "properties" in item)

        assert "deletedAt" in object_schema["properties"]
        assert "deletedBy" in object_schema["properties"]

        deleted_at = object_schema["properties"]["deletedAt"]
        assert deleted_at["type"] == "string"
        assert deleted_at["format"] == "date-time"
        assert deleted_at.get("nullable") is True
        assert deleted_at.get("readOnly") is True

        deleted_by = object_schema["properties"]["deletedBy"]
        assert deleted_by["type"] == "string"
        assert deleted_by["format"] == "uuid"
        assert deleted_by.get("nullable") is True
        assert deleted_by.get("readOnly") is True

    def test_user_owned_properties(self, openapi_spec: dict[str, Any]) -> None:
        """Verify UserOwnedResource has ownership tracking properties."""
        schemas = openapi_spec["components"]["schemas"]
        user_owned = schemas["UserOwnedResource"]

        # Find the object schema within allOf
        object_schema = next(item for item in user_owned["allOf"] if "properties" in item)

        assert "createdBy" in object_schema["properties"]
        assert "updatedBy" in object_schema["properties"]

        created_by = object_schema["properties"]["createdBy"]
        assert created_by["type"] == "string"
        assert created_by["format"] == "uuid"
        assert created_by.get("readOnly") is True

        updated_by = object_schema["properties"]["updatedBy"]
        assert updated_by["type"] == "string"
        assert updated_by["format"] == "uuid"
        assert updated_by.get("nullable") is True
        assert updated_by.get("readOnly") is True

    def test_error_schema_structure(self, openapi_spec: dict[str, Any]) -> None:
        """Verify Error schema has correct structure."""
        schemas = openapi_spec["components"]["schemas"]
        error_schema = schemas["Error"]

        required_fields = error_schema["required"]
        assert "error" in required_fields
        assert "message" in required_fields

        assert "error" in error_schema["properties"]
        assert "message" in error_schema["properties"]
        assert "details" in error_schema["properties"]

        error_prop = error_schema["properties"]["error"]
        assert error_prop["type"] == "string"

        message_prop = error_schema["properties"]["message"]
        assert message_prop["type"] == "string"
        assert message_prop["maxLength"] == 500

        details_prop = error_schema["properties"]["details"]
        assert details_prop["type"] == "string"
        assert details_prop.get("nullable") is True
        assert details_prop["maxLength"] == 2000

    def test_pagination_response_schemas(self, openapi_spec: dict[str, Any]) -> None:
        """Verify pagination response schemas have correct structure."""
        schemas = openapi_spec["components"]["schemas"]

        # ResourcesResponseBase
        response_base = schemas["ResourcesResponseBase"]
        assert "next" in response_base["properties"]
        assert "prev" in response_base["properties"]
        assert "total" in response_base["properties"]

        next_prop = response_base["properties"]["next"]
        assert next_prop["type"] == "string"
        assert next_prop.get("nullable") is True

        prev_prop = response_base["properties"]["prev"]
        assert prev_prop["type"] == "string"
        assert prev_prop.get("nullable") is True

        total_prop = response_base["properties"]["total"]
        assert total_prop["type"] == "integer"
        assert total_prop.get("nullable") is True
        assert total_prop["minimum"] == 0

        # ResourcesResponse extends ResourcesResponseBase
        resources_response = schemas["ResourcesResponse"]
        assert "allOf" in resources_response
        base_refs = [item for item in resources_response["allOf"] if "$ref" in item]
        assert any("ResourcesResponseBase" in ref["$ref"] for ref in base_refs)

        # Find the object schema within allOf
        object_schema = next(item for item in resources_response["allOf"] if "properties" in item)
        assert "resources" in object_schema["properties"]

        resources_prop = object_schema["properties"]["resources"]
        assert resources_prop["type"] == "array"
        assert resources_prop["maxItems"] == 100
