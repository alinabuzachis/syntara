"""CRUD endpoint compliance tests.

Validates that all CRUD endpoints declare the correct HTTP status codes
and 404 error responses by checking the OpenAPI specification structure.

IMPORTANT: These tests validate API CAPABILITY declarations in the OpenAPI spec,
not runtime behavior. They check:
- "Does a GET read endpoint declare a 200 response?" (NOT "Does it return 200?")
- "Does a DELETE endpoint declare a 404 response?" (NOT "Does it return 404?")

Runtime behavior is the responsibility of each endpoint's integration/functional tests.

Scope:
- GET single-resource reads: returns 200, declares 404
- POST creates: returns 201
- PATCH/PUT updates: returns 200, declares 404
- DELETE: returns 204, declares 404
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, NamedTuple

import pytest

from tests.unit.api.compliance.conftest import (
    MIN_EXCLUSION_REASON_LENGTH,
    get_response_codes,
)
from tests.unit.api.compliance.endpoint_discovery import (
    discover_create_endpoints,
    discover_delete_endpoints,
    discover_read_endpoints,
    discover_update_endpoints,
    load_all_crud_exclusions,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from tests.unit.api.compliance.endpoint_discovery import EndpointInfo


class CrudTypeConfig(NamedTuple):
    """Configuration for a single CRUD type."""

    discover: Callable[..., list[EndpointInfo]]
    expected_status: str
    requires_404: bool


CRUD_TYPES: dict[str, CrudTypeConfig] = {
    "read": CrudTypeConfig(discover_read_endpoints, "200", requires_404=True),
    "create": CrudTypeConfig(discover_create_endpoints, "201", requires_404=False),
    "update": CrudTypeConfig(discover_update_endpoints, "200", requires_404=True),
    "delete": CrudTypeConfig(discover_delete_endpoints, "204", requires_404=True),
}

VALID_CRUD_TYPES = set(CRUD_TYPES)


def _build_crud_test_params() -> list[Any]:
    """Build a flat parameter list across all CRUD types for parametrization."""
    params: list[Any] = []
    for crud_type, config in CRUD_TYPES.items():
        for ep in config.discover():
            params.append(
                pytest.param(ep, config.expected_status, config.requires_404, id=f"{crud_type}:{ep.operation_id}")
            )
    return params


# ---------------------------------------------------------------------------
# CRUD endpoint compliance
# ---------------------------------------------------------------------------


@pytest.mark.unit
@pytest.mark.compliance
@pytest.mark.parametrize(
    ("endpoint", "expected_status", "check_404"),
    _build_crud_test_params(),
)
class TestCrudEndpointCompliance:
    """Compliance tests for CRUD endpoints (read, create, update, delete)."""

    def test_returns_expected_status(
        self,
        endpoint: EndpointInfo,
        expected_status: str,
        check_404: bool,  # noqa: FBT001
        openapi_spec: dict[str, Any],
    ) -> None:
        """Validates the endpoint declares its expected success status code."""
        codes = get_response_codes(endpoint, openapi_spec)
        assert expected_status in codes, f"{endpoint.operation_id} does not declare a {expected_status} response"

    def test_declares_404(
        self,
        endpoint: EndpointInfo,
        expected_status: str,
        check_404: bool,  # noqa: FBT001
        openapi_spec: dict[str, Any],
    ) -> None:
        """Validates the endpoint declares a 404 response for missing resources."""
        if not check_404:
            pytest.skip(f"{endpoint.operation_id} is a create endpoint, 404 not required")
        codes = get_response_codes(endpoint, openapi_spec)
        assert "404" in codes, f"{endpoint.operation_id} does not declare a 404 response"


# ---------------------------------------------------------------------------
# Exclusion maintenance
# ---------------------------------------------------------------------------


@pytest.mark.unit
@pytest.mark.compliance
class TestCrudExclusionMaintenance:
    """Tests to ensure the CRUD exclusions list stays up-to-date and accurate."""

    @pytest.fixture(scope="class")
    def exclusions_list(self) -> list[dict[str, Any]]:
        """Load exclusions list once for all tests in this class."""
        data = load_all_crud_exclusions()
        result: list[dict[str, Any]] = data.get("exclusions", [])
        return result

    @pytest.fixture(scope="class")
    def all_discovered_by_type(self) -> dict[str, set[str]]:
        """Discover all endpoints per CRUD type (before exclusions) for validation."""
        return {
            crud_type: {ep.operation_id for ep in config.discover(apply_exclusions=False)}
            for crud_type, config in CRUD_TYPES.items()
        }

    def test_exclusions_have_justifications(self, exclusions_list: list[dict[str, Any]]) -> None:
        """Validates all exclusions have operation_id, crud_type, and meaningful reason."""
        for exc in exclusions_list:
            operation_id = exc.get("operation_id")
            crud_type = exc.get("crud_type")
            reason = exc.get("reason", "").strip()

            assert operation_id, "Exclusion missing 'operation_id'"
            assert crud_type, f"Exclusion '{operation_id}' missing 'crud_type'"
            assert crud_type in VALID_CRUD_TYPES, (
                f"Exclusion '{operation_id}' has invalid crud_type '{crud_type}', must be one of {VALID_CRUD_TYPES}"
            )
            assert reason, f"Exclusion '{operation_id}' missing 'reason'"
            assert len(reason) >= MIN_EXCLUSION_REASON_LENGTH, (
                f"Exclusion '{operation_id}' reason too brief (min {MIN_EXCLUSION_REASON_LENGTH} chars): {reason}"
            )

    def test_exclusions_reference_existing_endpoints(
        self,
        exclusions_list: list[dict[str, Any]],
        all_discovered_by_type: dict[str, set[str]],
    ) -> None:
        """Validates that all exclusions reference endpoints that exist in the discovery output."""
        missing = []
        for exc in exclusions_list:
            operation_id = exc.get("operation_id", "")
            crud_type = exc.get("crud_type", "")
            known_ids = all_discovered_by_type.get(crud_type, set())
            if operation_id not in known_ids:
                missing.append(f"{operation_id} (crud_type={crud_type})")

        if missing:
            pytest.fail(
                f"The following exclusions reference endpoints not found by their "
                f"discovery function: {', '.join(sorted(missing))}"
            )

    def test_excluded_endpoints_are_still_noncompliant(
        self,
        openapi_spec: dict[str, Any],
        exclusions_list: list[dict[str, Any]],
    ) -> None:
        """Validates that excluded endpoints still fail at least one check.

        If an endpoint passes all checks for its crud_type, the exclusion is stale.
        """
        all_endpoints_by_type: dict[str, list[EndpointInfo]] = {
            crud_type: list(config.discover(apply_exclusions=False)) for crud_type, config in CRUD_TYPES.items()
        }

        compliant_excluded = []

        for exc in exclusions_list:
            operation_id = exc.get("operation_id", "")
            crud_type = exc.get("crud_type", "")

            config = CRUD_TYPES.get(crud_type)
            if not config:
                continue

            endpoints = all_endpoints_by_type.get(crud_type, [])
            endpoint = next((ep for ep in endpoints if ep.operation_id == operation_id), None)
            if not endpoint:
                continue

            codes = get_response_codes(endpoint, openapi_spec)
            has_expected_status = config.expected_status in codes
            has_404 = "404" in codes if config.requires_404 else True

            if has_expected_status and has_404:
                compliant_excluded.append(f"{operation_id} (crud_type={crud_type})")

        if compliant_excluded:
            pytest.fail(
                f"The following excluded endpoints are now compliant and should be "
                f"removed from exclusions: {', '.join(compliant_excluded)}"
            )
