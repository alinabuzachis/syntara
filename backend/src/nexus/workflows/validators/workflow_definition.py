"""Validation class for V2 workflow definitions.

This module provides a validator class for workflow definitions,
metadata, and structure validation. The JSON schema files under
``src/nexus/schemas/workflows/v2/`` are resolved on demand via a
registry retrieve callback and cached for the lifetime of the process.
"""

import json
from functools import lru_cache
from typing import Any

import jsonschema
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from nexus.core.exceptions import SafeValueError
from nexus.schemas import SCHEMA_DIR
from nexus.workflows.models.workflow_validation_result import ValidationIssue, WorkflowValidationResult
from nexus.workflows.workflow_engine.graph_backend import InMemoryGraphBackend

_SCHEMA_DIR = SCHEMA_DIR / "workflows" / "v2"
_BASE_URI = "https://syntara-orchestration.io/schemas/workflows/v2/"
_FEEDBACK_PORTS: frozenset[str] = frozenset({"iterate"})


def _retrieve_schema(uri: str) -> Resource:
    relative = uri.removeprefix(_BASE_URI)
    path = (_SCHEMA_DIR / relative).resolve()
    if not path.is_relative_to(_SCHEMA_DIR.resolve()):
        msg = f"Schema URI resolves outside schema directory: {uri}"
        raise SafeValueError(msg)
    schema = json.loads(path.read_text())
    return Resource.from_contents(schema, default_specification=DRAFT202012)


@lru_cache(maxsize=1)
def _get_validator() -> jsonschema.Draft202012Validator:
    main_schema = json.loads((_SCHEMA_DIR / "workflow_definition.schema.json").read_text())
    common_schema = json.loads((_SCHEMA_DIR / "common-definitions.schema.json").read_text())

    registry: Registry = Registry(retrieve=_retrieve_schema).with_resources(  # type: ignore[call-arg]
        [
            (
                _BASE_URI + "common-definitions.schema.json",
                Resource.from_contents(common_schema, default_specification=DRAFT202012),
            ),
        ]
    )
    return jsonschema.Draft202012Validator(main_schema, registry=registry)


def _extract_node_ids(workflow_definition: dict[str, Any]) -> set[str]:
    node_ids: set[str] = set()
    for item in (*workflow_definition.get("triggers", []), *workflow_definition.get("nodes", [])):
        nid = item.get("id")
        if nid is not None:
            node_ids.add(nid)
    return node_ids


def _check_edge_references(workflow_definition: dict[str, Any], node_ids: set[str]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for edge in workflow_definition.get("edges", []):
        src, dst = edge["from"], edge["to"]
        if src not in node_ids:
            issues.append(ValidationIssue(message=f"Edge references non-existent node '{src}'", node_id=src))
        if dst not in node_ids:
            issues.append(ValidationIssue(message=f"Edge references non-existent node '{dst}'", node_id=dst))
    return issues


def _build_graph_and_find_connected(
    workflow_definition: dict[str, Any],
) -> set[str]:
    connected: set[str] = set()
    for edge in workflow_definition.get("edges", []):
        if edge.get("to_port") not in _FEEDBACK_PORTS:
            connected.add(edge["from"])
            connected.add(edge["to"])
    return connected


def _check_cycles(workflow_definition: dict[str, Any], node_ids: set[str]) -> list[ValidationIssue]:
    backend = InMemoryGraphBackend()
    for nid in node_ids:
        backend.add_node(nid, {})
    for edge in workflow_definition.get("edges", []):
        if edge.get("to_port") not in _FEEDBACK_PORTS:
            backend.add_edge(edge["from"], edge["to"])
    cycles = backend.find_cycles()
    if cycles:
        cycle_desc = " -> ".join([*cycles[0], cycles[0][0]])
        return [ValidationIssue(message=f"Workflow definition contains a cycle: {cycle_desc}")]
    return []


def _check_orphaned_nodes(
    workflow_definition: dict[str, Any], node_ids: set[str], connected_nodes: set[str]
) -> list[ValidationIssue]:
    trigger_ids = {t.get("id") for t in workflow_definition.get("triggers", []) if t.get("id")}
    return [
        ValidationIssue(
            message=f"Node '{nid}' has no incoming or outgoing edges",
            node_id=nid,
        )
        for nid in node_ids - trigger_ids
        if nid not in connected_nodes
    ]


class WorkflowValidator:
    """Validator for V2 workflows and metadata.

    This class provides validation methods for workflow definitions and metadata.
    The main entry point is validate_workflow_definition() which runs all checks.
    """

    def validate_workflow_definition(self, workflow_definition: dict[str, Any]) -> None:
        """Run all validation checks on workflow definition.

        This is the main validation entry point that calls all individual
        validation methods for workflow structure.

        Args:
            workflow_definition: Workflow definition dictionary to validate

        Raises:
            SafeValueError: If schema_version is not 2.0.0 or required fields are missing

        """
        self._validate_schema_version(workflow_definition)
        self._validate_required_fields(workflow_definition)
        self._validate_against_schema(workflow_definition)
        self._validate_graph_structure(workflow_definition)

    def validate_workflow_name(self, name: str) -> None:
        """Validate workflow name is not empty.

        Args:
            name: Workflow name to validate

        Raises:
            SafeValueError: If name is empty

        """
        if not name:
            msg = "Workflow name cannot be empty"
            raise SafeValueError(msg)

    def _validate_schema_version(self, workflow_definition: dict[str, Any]) -> None:
        """Validate schema version is 2.0.0.

        Args:
            workflow_definition: Workflow definition dictionary

        Raises:
            SafeValueError: If schema_version is not 2.0.0

        """
        schema_version = workflow_definition.get("schema_version")
        if schema_version != "2.0.0":
            msg = (
                f"Unsupported schema_version: {schema_version}. Only V2 workflows (schema_version=2.0.0) are supported."
            )
            raise SafeValueError(msg)

    def _validate_required_fields(self, workflow_definition: dict[str, Any]) -> None:
        """Validate required fields are present.

        Args:
            workflow_definition: Workflow definition dictionary

        Raises:
            SafeValueError: If required fields are missing

        """
        if "triggers" not in workflow_definition:
            msg = "V2 workflow must have 'triggers' field"
            raise SafeValueError(msg)

        if "nodes" not in workflow_definition:
            msg = "V2 workflow must have 'nodes' field"
            raise SafeValueError(msg)

        if "edges" not in workflow_definition:
            msg = "V2 workflow must have 'edges' field"
            raise SafeValueError(msg)

    def _validate_against_schema(self, workflow_definition: dict[str, Any]) -> None:
        errors = list(_get_validator().iter_errors(workflow_definition))
        if not errors:
            return
        details: list[str] = []
        for error in errors:
            path = ".".join(str(p) for p in error.absolute_path)
            details.append(f"{path}: {error.message}" if path else error.message)
        msg = f"Workflow definition schema validation failed: {'; '.join(details)}"
        raise SafeValueError(msg)

    def collect_validation_issues(self, workflow_definition: dict[str, Any]) -> WorkflowValidationResult:
        """Run all validation checks and collect issues instead of raising.

        Unlike validate_workflow_definition(), this method does not raise on the
        first error. It runs every applicable validator and returns a structured
        result with errors and warnings separated.

        Args:
            workflow_definition: Workflow definition dictionary to validate

        Returns:
            WorkflowValidationResult with errors, warnings, and validity flag

        """
        errors: list[ValidationIssue] = []

        schema_version = workflow_definition.get("schema_version")
        if schema_version != "2.0.0":
            errors.append(
                ValidationIssue(
                    message=(
                        f"Unsupported schema_version: {schema_version}. "
                        "Only V2 workflows (schema_version=2.0.0) are supported."
                    ),
                )
            )
            return WorkflowValidationResult(valid=False, errors=errors)

        errors.extend(
            ValidationIssue(message=f"V2 workflow must have '{field}' field")
            for field in ("triggers", "nodes", "edges")
            if field not in workflow_definition
        )

        if errors:
            return WorkflowValidationResult(valid=False, errors=errors)

        for error in _get_validator().iter_errors(workflow_definition):
            path = ".".join(str(p) for p in error.absolute_path)
            errors.append(
                ValidationIssue(
                    message=f"{path}: {error.message}" if path else error.message,
                )
            )

        if errors:
            return WorkflowValidationResult(valid=False, errors=errors)

        graph_errors, warnings = self._collect_graph_issues(workflow_definition)
        errors.extend(graph_errors)

        return WorkflowValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)

    def _collect_graph_issues(
        self, workflow_definition: dict[str, Any]
    ) -> tuple[list[ValidationIssue], list[ValidationIssue]]:
        """Collect graph structure validation issues without raising.

        Returns:
            Tuple of (errors, warnings)

        """
        node_ids = _extract_node_ids(workflow_definition)
        edge_issues = _check_edge_references(workflow_definition, node_ids)
        if edge_issues:
            return edge_issues, []

        connected_nodes = _build_graph_and_find_connected(workflow_definition)
        errors = _check_cycles(workflow_definition, node_ids)
        warnings = _check_orphaned_nodes(workflow_definition, node_ids, connected_nodes)
        return errors, warnings

    def _validate_graph_structure(self, workflow_definition: dict[str, Any]) -> None:
        node_ids = _extract_node_ids(workflow_definition)

        edge_issues = _check_edge_references(workflow_definition, node_ids)
        if edge_issues:
            raise SafeValueError(edge_issues[0].message)

        cycle_issues = _check_cycles(workflow_definition, node_ids)
        if cycle_issues:
            raise SafeValueError(cycle_issues[0].message)
