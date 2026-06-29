"""Endpoint discovery from OpenAPI specification.

This module discovers all endpoints from the bundled OpenAPI spec and
extracts their metadata (path, operation ID, response type, etc.).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from nexus.core.router.loader import load_openapi_schema

EXCLUSIONS_FILE = Path(__file__).parent / "list_compliance_exclusions.yaml"


@dataclass
class EndpointInfo:
    """Information about a discovered endpoint.

    Attributes:
        path: API path
        operation_id: OpenAPI operation ID
        method: HTTP method
        response_type: Response type name
        array_field: Name of array field in response

    """

    path: str
    operation_id: str
    method: str
    response_type: str
    array_field: str
    tags: list[str]


def _get_response_schema_ref(operation: dict[str, Any]) -> str:
    """Extract schema $ref from operation's 200 response.

    Args:
        operation: OpenAPI operation object

    Returns:
        Schema reference string (e.g., "#/components/schemas/ResourcesResponse_WorkflowRead_")
        or empty string if not found

    """
    responses = operation.get("responses", {})
    success_response = responses.get("200", {})
    content = success_response.get("content", {})
    json_content = content.get("application/json", {})
    schema = json_content.get("schema", {})
    ref: str = schema.get("$ref", "")
    return ref


def _get_array_field_from_properties(properties: dict[str, Any]) -> str:
    """Extract the array field name from response schema properties.

    Returns the first array field found. For list endpoint responses, there is
    typically only one primary array field (resources, results, users, etc.).

    If multiple array fields exist, returns the first one encountered (dict iteration order).
    This is acceptable because list responses should only have one primary collection field.

    Args:
        properties: Response schema properties dictionary

    Returns:
        Array field name (e.g., "resources", "results", "users") or empty string if none

    """
    for field_name, field_schema in properties.items():
        if field_schema.get("type") == "array":
            return field_name

    return ""


def is_list_operation(operation_id: str, properties: dict[str, Any]) -> bool:
    """Check if an operation is a list endpoint.

    Uses two detection methods:
    1. Fast path: Check if operation_id starts with "list_" (convention)
    2. Fallback: Inspect response schema - must have array field but NO
       single-resource identifier (like 'id'). This distinguishes list
       responses from single resources that happen to have array fields.

    This catches both standard list operations (list_workflows) and
    query operations that return lists (who_can, what_can_i).

    Args:
        operation_id: OpenAPI operation ID
        properties: Response schema properties dictionary

    Returns:
        True if this is a list operation

    """
    # Fast path: follows naming convention
    if operation_id.startswith("list_"):
        return True

    # Fallback: has array field but NOT a single-resource response
    # Single resources have identifier fields
    has_identifier = "id" in properties
    has_array_field = bool(_get_array_field_from_properties(properties))

    return has_array_field and not has_identifier


def discover_list_endpoints() -> list[EndpointInfo]:
    """Discover all list endpoints from the OpenAPI specification.

    Parses the bundled OpenAPI spec and extracts metadata for all list endpoints.

    Returns:
        List of EndpointInfo objects for all discovered list endpoints.
        Compliance tests will validate each endpoint's behavior.

    Raises:
        FileNotFoundError: If the OpenAPI spec cannot be loaded

    Example:
        >>> endpoints = discover_list_endpoints()
        >>> print(f"Found {len(endpoints)} list endpoints")
        >>> for ep in endpoints:
        ...     print(f"{ep.operation_id}: {ep.response_type}")

    """
    schema = load_openapi_schema("openapi.yaml")

    if schema is None:
        msg = "Failed to load OpenAPI spec from nexus.schemas.openapi.yaml"
        raise FileNotFoundError(msg)

    spec = schema.schema_data
    paths = spec.get("paths", {})
    schemas = spec.get("components", {}).get("schemas", {})

    endpoints: list[EndpointInfo] = []

    for path, path_item in paths.items():
        # Check GET (standard) and POST (query endpoints like who_can)
        for method in ["get", "post"]:
            operation = path_item.get(method)
            if not operation:
                continue

            operation_id = operation.get("operationId", "")
            schema_ref = _get_response_schema_ref(operation)

            # Skip endpoints without JSON response schemas
            if not schema_ref:
                continue

            # Extract response type from schema reference
            response_type = schema_ref.split("/")[-1]

            # Look up response schema once
            response_schema = schemas.get(response_type, {})
            properties = response_schema.get("properties", {})

            # Check if this is a list operation
            if not is_list_operation(operation_id, properties):
                continue

            # Extract array field name
            array_field = _get_array_field_from_properties(properties)

            endpoint_info = EndpointInfo(
                path=path,
                operation_id=operation_id,
                method=method.upper(),
                response_type=response_type,
                array_field=array_field,
                tags=operation.get("tags", []),
            )

            endpoints.append(endpoint_info)

    return endpoints


def load_exclusions() -> dict[str, Any]:
    """Load endpoint exclusions from YAML file.

    Returns:
        Dictionary with 'exclusions' list

    """
    if not EXCLUSIONS_FILE.exists():
        return {"exclusions": []}

    with EXCLUSIONS_FILE.open() as f:
        return yaml.safe_load(f) or {"exclusions": []}


def discover_testable_list_endpoints() -> list[EndpointInfo]:
    """Discover list endpoints that should be tested for compliance.

    Filters out:
    - AAP proxy endpoints (tagged "aap" in OpenAPI spec, locked to upstream format)
    - Explicitly excluded endpoints from list_compliance_exclusions.yaml

    Includes:
    - Parameterized endpoints (with path parameters like {project_id})

    Returns:
        List of EndpointInfo objects for all testable list endpoints.

    Note:
        This function combines discovery and filtering so both parametrize
        decorators and fixtures can call it directly.

    """
    all_list_endpoints = discover_list_endpoints()
    exclusions = load_exclusions()

    excluded_operation_ids = {exc["operation_id"] for exc in exclusions.get("exclusions", []) if "operation_id" in exc}

    # Filter AAP proxy endpoints (tagged "aap" in OpenAPI spec) and excluded endpoints
    return [ep for ep in all_list_endpoints if "aap" not in ep.tags and ep.operation_id not in excluded_operation_ids]
