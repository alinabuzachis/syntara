"""OpenAPI schema loading and parsing."""

import json
import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

logger = logging.getLogger("nexus.core.router.loader")


class EndpointDefinition:
    """Represents a single endpoint from OpenAPI spec."""

    def __init__(
        self,
        path: str,
        method: str,
        operation_id: str,
        parameters: list[dict[str, Any]],
        request_body: dict[str, Any] | None = None,
    ) -> None:
        """Initialize endpoint definition with path, method, and parameters."""
        self.path = path
        self.method = method.lower()
        self.operation_id = operation_id
        self.parameters = parameters or []
        self.request_body = request_body

    @property
    def expected_function_name(self) -> str:
        """Convert operationId to snake_case for function name."""
        # Convert camelCase to snake_case
        result = []
        for i, char in enumerate(self.operation_id):
            if char.isupper() and i > 0 and self.operation_id[i - 1].islower():
                # Add underscore before uppercase letter
                result.append("_")
            result.append(char.lower())
        return "".join(result)

    @property
    def path_parameters(self) -> list[str]:
        """Get list of path parameter names."""
        return [param["name"] for param in self.parameters if param.get("in") == "path"]

    @property
    def query_parameters(self) -> list[str]:
        """Get list of query parameter names."""
        return [param["name"] for param in self.parameters if param.get("in") == "query"]

    @property
    def required_parameters(self) -> list[str]:
        """Get list of required parameter names.

        Per OpenAPI spec, path parameters default to required=true,
        while query/header/cookie parameters default to required=false.
        """
        return [param["name"] for param in self.parameters if param.get("required", param.get("in") == "path")]

    def __repr__(self) -> str:
        """Return string representation of endpoint."""
        return f"<Endpoint {self.method.upper()} {self.path} ({self.operation_id})>"


class OpenAPISchema:
    """Represents a loaded OpenAPI schema."""

    def __init__(self, filename: str, schema_data: dict[str, Any]) -> None:
        """Initialize OpenAPI schema from file data."""
        self.filename = filename
        self.schema_data = schema_data
        self.endpoints: list[EndpointDefinition] = []
        self._parse_endpoints()

    @property
    def domain(self) -> str:
        """Extract domain name from filename.

        Supports multiple patterns:
        - schemas/{domain}.json -> domain is filename stem (e.g., 'example.json' -> 'example')
        - schemas/{domain}.yaml -> domain is filename stem (e.g., 'example.yaml' -> 'example')
        - schemas/{domain}/openapi.{json|yaml|yml} -> domain is parent directory
          (e.g., 'example/openapi.yaml' -> 'example')
        """
        path = Path(self.filename)

        # If filename is 'openapi.{ext}', use parent directory as domain
        if path.stem == "openapi" and path.suffix in {".json", ".yaml", ".yml"}:
            return path.parent.name

        # Otherwise, use filename stem as domain
        return path.stem

    @property
    def base_path(self) -> str:
        """Extract common base path from server URLs.

        Finds the longest common path prefix from all defined server URLs.
        If no servers are defined, returns empty string (paths are treated as absolute).

        Returns:
            Common base path (e.g., '/api/v1') or empty string

        Examples:
            - Servers: ['http://localhost:8000/api/v1', 'https://prod.com/api/v1'] -> '/api/v1'
            - Servers: ['http://localhost:8000/api/v1', 'https://prod.com/api/v2'] -> '/api'
            - No servers -> ''

        """
        servers = self.schema_data.get("servers", [])

        if not servers:
            return ""

        # Extract path from each server URL
        paths = []
        for server in servers:
            url = server.get("url", "")
            parsed = urlparse(url)
            path = parsed.path.rstrip("/")  # Remove trailing slash
            paths.append(path)  # Include empty paths too

        # If any server has no path, we can't determine a common base path
        if "" in paths and len(set(paths)) > 1:
            return ""

        # Remove empty paths for comparison
        paths = [p for p in paths if p]

        if not paths:
            return ""

        # Find longest common prefix
        if len(paths) == 1:
            return str(paths[0])

        # Find common prefix by comparing path segments
        common_segments = []
        split_paths = [p.split("/") for p in paths]

        for segments in zip(*split_paths, strict=False):
            if len(set(segments)) == 1:  # All segments are the same
                common_segments.append(segments[0])
            else:
                break

        return "/".join(common_segments)

    def _parse_endpoints(self) -> None:
        """Parse endpoints from OpenAPI paths."""
        paths = self.schema_data.get("paths", {})

        for path, path_item in paths.items():
            # Each path can have multiple methods
            for method in ["get", "post", "put", "delete", "patch", "options", "head"]:
                if method in path_item:
                    operation = path_item[method]
                    operation_id = operation.get("operationId")

                    if not operation_id:
                        logger.warning("Missing operationId for %s %s in %s", method.upper(), path, self.filename)
                        continue

                    endpoint = EndpointDefinition(
                        path=path,
                        method=method,
                        operation_id=operation_id,
                        parameters=operation.get("parameters", []),
                        request_body=operation.get("requestBody"),
                    )
                    self.endpoints.append(endpoint)

    def __repr__(self) -> str:
        """Return string representation of schema."""
        return f"<OpenAPISchema {self.filename} ({len(self.endpoints)} endpoints)>"


def load_openapi_schema(filename: str, schemas_dir: str = "schemas") -> OpenAPISchema | None:
    """Load and parse an OpenAPI schema file.

    Supports both JSON and YAML formats. The format is detected automatically
    based on the file extension (.json, .yaml, .yml).

    Args:
        filename: Name of the schema file (e.g., 'example.json', 'example/openapi.yaml')
        schemas_dir: Directory containing schema files (default: 'schemas')

    Returns:
        OpenAPISchema instance or None if loading fails

    """
    # Find project root by looking for the schemas directory
    # Start from current file location and go up
    current_dir = Path(__file__).resolve().parent
    project_root = current_dir

    # Navigate up to find the project root (where schemas directory exists)
    while project_root.parent != project_root:
        potential_schemas = project_root.parent / schemas_dir
        if potential_schemas.exists() and potential_schemas.is_dir():
            project_root = project_root.parent
            break
        project_root = project_root.parent

    schema_path = project_root / schemas_dir / filename

    if not schema_path.exists():
        logger.error("Schema file not found: %s", schema_path)
        return None

    try:
        with schema_path.open(encoding="utf-8") as f:
            # Detect format based on file extension
            if schema_path.suffix in {".yaml", ".yml"}:
                schema_data = yaml.safe_load(f)
            elif schema_path.suffix == ".json":
                schema_data = json.load(f)
            else:
                logger.error("Unsupported schema format: %s (use .json, .yaml, or .yml)", schema_path.suffix)
                return None

        schema = OpenAPISchema(filename, schema_data)
        logger.info("Loaded %s: %d endpoints for domain '%s'", filename, len(schema.endpoints), schema.domain)
        return schema

    except json.JSONDecodeError:
        logger.exception("Invalid JSON in %s", filename)
        return None
    except yaml.YAMLError:
        logger.exception("Invalid YAML in %s", filename)
        return None
    except Exception:
        logger.exception("Error loading %s", filename)
        return None


def load_schemas(schema_files: list[str], schemas_dir: str = "schemas") -> list[OpenAPISchema]:
    """Load multiple OpenAPI schema files.

    Args:
        schema_files: List of schema filenames
        schemas_dir: Directory containing schema files

    Returns:
        List of successfully loaded OpenAPISchema instances

    """
    schemas = []

    for filename in schema_files:
        schema = load_openapi_schema(filename, schemas_dir)
        if schema:
            schemas.append(schema)

    logger.info("Loaded %d/%d schema files successfully", len(schemas), len(schema_files))
    return schemas
