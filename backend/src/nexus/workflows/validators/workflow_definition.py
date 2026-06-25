"""Validation class for V2 workflow definitions.

This module provides a validator class for workflow definitions,
metadata, and structure validation. The JSON schema files under
``src/nexus/schemas/workflows/v2/`` are resolved on demand via a
registry retrieve callback and cached for the lifetime of the process.
"""

import json
from collections import defaultdict, deque
from functools import lru_cache
from typing import Any

import jsonschema
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from nexus.core.exceptions import SafeValueError
from nexus.schemas import SCHEMA_DIR
from nexus.workflows.models.validation_finding import (
    ValidationCategory,
    ValidationFinding,
    ValidationResult,
    ValidationSeverity,
)
from nexus.workflows.models.workflow_validation_result import ValidationIssue, WorkflowValidationResult
from nexus.workflows.validators.template_expressions import check_template_expressions
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


_ELEMENT_SCHEMA_DEFS: dict[str, str] = {"nodes": "node", "triggers": "trigger_node"}


@lru_cache(maxsize=2)
def _get_element_validator(collection: str) -> jsonschema.Draft202012Validator:
    """Return a validator scoped to a single node or trigger element."""
    main_schema = json.loads((_SCHEMA_DIR / "workflow_definition.schema.json").read_text())
    def_name = _ELEMENT_SCHEMA_DEFS[collection]
    sub_schema = main_schema["$defs"][def_name]
    return _get_validator().evolve(schema=sub_schema)  # type: ignore[return-value]


def _extract_node_ids(workflow_definition: dict[str, Any]) -> set[str]:
    node_ids: set[str] = set()
    for item in (*workflow_definition.get("triggers", []), *workflow_definition.get("nodes", [])):
        nid = item.get("id")
        if nid is not None:
            node_ids.add(nid)
    return node_ids


def _check_edge_references_findings(workflow_definition: dict[str, Any], node_ids: set[str]) -> list[ValidationFinding]:
    findings: list[ValidationFinding] = []
    for edge in workflow_definition.get("edges", []):
        src, dst = edge["from"], edge["to"]
        if src not in node_ids:
            findings.append(
                ValidationFinding(
                    severity=ValidationSeverity.error,
                    category=ValidationCategory.invalid_reference,
                    message=f"Edge references non-existent node '{src}'",
                    node_id=src,
                )
            )
        if dst not in node_ids:
            findings.append(
                ValidationFinding(
                    severity=ValidationSeverity.error,
                    category=ValidationCategory.invalid_reference,
                    message=f"Edge references non-existent node '{dst}'",
                    node_id=dst,
                )
            )
    return findings


def _check_edge_references(workflow_definition: dict[str, Any], node_ids: set[str]) -> list[ValidationIssue]:
    return [
        ValidationIssue(message=f.message, node_id=f.node_id)
        for f in _check_edge_references_findings(workflow_definition, node_ids)
    ]


def _check_cycles_findings(workflow_definition: dict[str, Any], node_ids: set[str]) -> list[ValidationFinding]:
    backend = InMemoryGraphBackend()
    for nid in node_ids:
        backend.add_node(nid, {})
    for edge in workflow_definition.get("edges", []):
        if edge.get("to_port") not in _FEEDBACK_PORTS:
            backend.add_edge(edge["from"], edge["to"])
    cycles = backend.find_cycles()
    if cycles:
        cycle_desc = " -> ".join([*cycles[0], cycles[0][0]])
        return [
            ValidationFinding(
                severity=ValidationSeverity.error,
                category=ValidationCategory.cycle_detected,
                message=f"Workflow definition contains a cycle: {cycle_desc}",
            )
        ]
    return []


def _check_cycles(workflow_definition: dict[str, Any], node_ids: set[str]) -> list[ValidationIssue]:
    return [
        ValidationIssue(message=f.message, node_id=f.node_id)
        for f in _check_cycles_findings(workflow_definition, node_ids)
    ]


def _check_orphaned_nodes_findings(workflow_definition: dict[str, Any], node_ids: set[str]) -> list[ValidationFinding]:
    trigger_ids = {t.get("id") for t in workflow_definition.get("triggers", []) if t.get("id")}
    reachable = _reachable_from_triggers(workflow_definition, trigger_ids)
    unreachable = (node_ids - trigger_ids) - reachable
    return [
        ValidationFinding(
            severity=ValidationSeverity.error,
            category=ValidationCategory.orphaned_node,
            message=f"Node '{nid}' is unreachable from any trigger",
            node_id=nid,
        )
        for nid in sorted(unreachable)
    ]


def _reachable_from_triggers(workflow_definition: dict[str, Any], trigger_ids: set[str]) -> set[str]:
    """BFS over forward edges to find all nodes reachable from any trigger."""
    adjacency: dict[str, list[str]] = {}
    for edge in workflow_definition.get("edges", []):
        if edge.get("to_port") not in _FEEDBACK_PORTS:
            adjacency.setdefault(edge["from"], []).append(edge["to"])
    visited: set[str] = set()
    queue: deque[str] = deque(trigger_ids)
    while queue:
        node = queue.popleft()
        if node in visited:
            continue
        visited.add(node)
        queue.extend(adjacency.get(node, []))
    return visited - trigger_ids


def _check_converge_node_findings(
    workflow_definition: dict[str, Any],
) -> list[ValidationFinding]:
    """Check converge node configuration against the workflow graph structure.

    Validates:
    - Each converge node has at least 2 incoming branches (0 = error, 1 = error)
    - For ``strategy='any'``, ``n_required`` does not exceed the branch count
    """
    findings: list[ValidationFinding] = []

    predecessors: dict[str, set[str]] = defaultdict(set)
    for edge in workflow_definition.get("edges", []):
        if edge.get("to_port") not in _FEEDBACK_PORTS:
            predecessors[edge["to"]].add(edge["from"])

    for node in workflow_definition.get("nodes", []):
        if node.get("type") != "converge":
            continue
        node_id = node.get("id")
        if node_id is None:
            continue

        pred_count = len(predecessors.get(node_id, []))

        if pred_count == 0:
            findings.append(
                ValidationFinding(
                    severity=ValidationSeverity.error,
                    category=ValidationCategory.converge_configuration,
                    message=f"Converge node '{node_id}' has no incoming edges (unreachable synchronization point)",
                    node_id=node_id,
                )
            )
        elif pred_count == 1:
            findings.append(
                ValidationFinding(
                    severity=ValidationSeverity.error,
                    category=ValidationCategory.converge_configuration,
                    message=(
                        f"Converge node '{node_id}' has only 1 incoming branch; "
                        f"converge requires at least 2 predecessors"
                    ),
                    node_id=node_id,
                )
            )

        params = node.get("parameters", {})
        strategy = params.get("strategy", "all")
        n_required = params.get("n_required")
        if strategy == "any" and n_required is not None and pred_count > 0 and n_required > pred_count:
            findings.append(
                ValidationFinding(
                    severity=ValidationSeverity.error,
                    category=ValidationCategory.converge_configuration,
                    message=(
                        f"Converge node '{node_id}': n_required ({n_required}) exceeds "
                        f"the number of incoming branches ({pred_count})"
                    ),
                    node_id=node_id,
                    field_path="parameters.n_required",
                )
            )

    return findings


def _select_best_branch(
    context_errors: list[jsonschema.ValidationError],
) -> tuple[Any, dict[Any, list[str]]]:
    """Pick the best-matching ``oneOf`` branch from context errors.

    Groups by ``schema_path[0]`` (the branch index), prefers branches
    without type-discriminator ``const`` errors, and picks the one with
    fewest total errors.

    Returns ``(best_branch_index, branches_dict)``.  The caller decides
    how to handle the ``branch_all_type_const`` fallback.
    """
    branches: dict[Any, list[str]] = defaultdict(list)
    branch_has_type_const: dict[Any, bool] = defaultdict(bool)
    for ctx in context_errors:
        branch_idx = ctx.schema_path[0]
        branches[branch_idx].append(ctx.message)
        if ctx.validator == "const" and list(ctx.relative_path) == ["type"]:
            branch_has_type_const[branch_idx] = True

    no_type_const = [k for k in branches if not branch_has_type_const[k]]
    candidates = no_type_const if no_type_const else list(branches)
    best_idx = min(candidates, key=lambda k: len(branches[k]))
    return best_idx, branches


def _best_branch_messages(error: jsonschema.ValidationError) -> list[str]:
    """Extract error messages from the best-matching ``oneOf`` branch.

    Groups context errors by their ``schema_path[0]`` (the ``oneOf`` branch
    index) and picks the branch with the fewest errors — this is the branch
    whose type matches the submitted node, so its errors are the actionable
    ones.

    When every branch fails only on the type discriminator ``const``, the
    node type is unrecognised — fall back to the top-level ``oneOf`` message.
    """
    if not error.context:
        return [error.message]
    best_idx, branches = _select_best_branch(error.context)
    if len(branches[best_idx]) == 1 and any(
        ctx.validator == "const" and list(ctx.relative_path) == ["type"]
        for ctx in error.context
        if ctx.schema_path[0] == best_idx
    ):
        return [error.message]
    return branches[best_idx]


_NODE_BASE_PROPERTIES = frozenset(
    {"id", "type", "name", "description", "parameters", "settings", "outputs", "position"}
)


def _get_nested_parameter_errors(
    error: jsonschema.ValidationError,
    workflow_definition: dict[str, Any],
    best_messages: list[str],
) -> list[str]:
    """When ``parameters`` is required but missing, discover what it should contain.

    Patches the element with ``parameters: {}`` and validates just the element
    against its sub-schema to surface nested required-field errors (e.g.
    ``'language' is a required property``) without re-validating the entire
    workflow definition.
    """
    if "'parameters' is a required property" not in best_messages:
        return []
    path_parts = list(error.absolute_path)
    _min_len = 2
    if len(path_parts) < _min_len or path_parts[0] not in ("nodes", "triggers"):
        return []
    collection = str(path_parts[0])
    idx = int(path_parts[1])
    try:
        original = workflow_definition[collection][idx]
    except (IndexError, KeyError):
        return []

    if not original.get("type"):
        return []

    patched_element = {k: v for k, v in original.items() if k in _NODE_BASE_PROPERTIES}
    patched_element["parameters"] = {}

    original_set = set(best_messages)
    supplementary: list[str] = []
    element_validator = _get_element_validator(collection)
    for err in element_validator.iter_errors(patched_element):
        if not err.context:
            continue
        best_idx, branches = _select_best_branch(err.context)
        supplementary.extend(msg for msg in branches[best_idx] if msg not in original_set)
    return supplementary


def _extract_node_id_and_field(
    path_parts: list[Any], workflow_definition: dict[str, Any]
) -> tuple[str | None, str | None]:
    """Derive ``node_id`` and ``field_path`` from a JSON Schema error path.

    For paths like ``['nodes', 0, 'parameters', 'language']``, extracts the
    node's ``id`` from the definition and returns the remainder as
    ``field_path``.
    """
    _min_element_path_len = 2
    if len(path_parts) >= _min_element_path_len and path_parts[0] in ("nodes", "triggers"):
        idx = path_parts[1]
        try:
            element = workflow_definition[path_parts[0]][idx]
            node_id = element.get("id")
        except (IndexError, KeyError, TypeError):
            node_id = None
        remainder = path_parts[2:]
        field_path = ".".join(str(p) for p in remainder) if remainder else None
        return node_id, field_path
    if path_parts:
        return None, ".".join(str(p) for p in path_parts)
    return None, None


_NODE_SUMMARY_KEYS = ("id", "type", "name")


def _build_node_id_index(workflow_definition: dict[str, Any]) -> dict[str, str]:
    """Map each node/trigger ``id`` to its element key (e.g. ``nodes.0``)."""
    index: dict[str, str] = {}
    for collection in ("nodes", "triggers"):
        for i, item in enumerate(workflow_definition.get(collection, [])):
            nid = item.get("id")
            if nid is not None:
                index[nid] = f"{collection}.{i}"
    return index


def _element_summary(element_key: str, workflow_definition: dict[str, Any]) -> str:
    """Return a concise ``{id, type, name}`` summary for a node/trigger element."""
    parts = element_key.split(".")
    _expected_parts = 2
    if len(parts) == _expected_parts:
        try:
            element = workflow_definition[parts[0]][int(parts[1])]
            summary = {k: element[k] for k in _NODE_SUMMARY_KEYS if k in element}
            return str(summary)
        except (KeyError, IndexError, ValueError):
            pass
    return element_key


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
        node_ids = _extract_node_ids(workflow_definition)
        self._validate_graph_structure(workflow_definition, node_ids)
        self._validate_template_expressions(workflow_definition, node_ids)

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

    def _collect_findings(self, workflow_definition: dict[str, Any]) -> list[ValidationFinding]:
        """Run all validators and return individual findings.

        Args:
            workflow_definition: Workflow definition dictionary to validate

        Returns:
            List of ValidationFinding objects, one per issue

        """
        findings: list[ValidationFinding] = []

        schema_version = workflow_definition.get("schema_version")
        if schema_version != "2.0.0":
            findings.append(
                ValidationFinding(
                    severity=ValidationSeverity.error,
                    category=ValidationCategory.schema_version,
                    message=(
                        f"Unsupported schema_version: {schema_version}. "
                        "Only V2 workflows (schema_version=2.0.0) are supported."
                    ),
                )
            )
            return findings

        findings.extend(
            ValidationFinding(
                severity=ValidationSeverity.error,
                category=ValidationCategory.missing_field,
                message=f"V2 workflow must have '{field}' field",
            )
            for field in ("triggers", "nodes", "edges")
            if field not in workflow_definition
        )
        if findings:
            return findings

        findings.extend(self._collect_schema_findings(workflow_definition))
        if any(f.severity == ValidationSeverity.error for f in findings):
            return findings

        node_ids = _extract_node_ids(workflow_definition)
        findings.extend(_check_edge_references_findings(workflow_definition, node_ids))
        if any(f.category == ValidationCategory.invalid_reference for f in findings):
            return findings

        findings.extend(_check_cycles_findings(workflow_definition, node_ids))
        findings.extend(_check_orphaned_nodes_findings(workflow_definition, node_ids))
        findings.extend(_check_converge_node_findings(workflow_definition))
        return findings

    def _collect_schema_findings(self, workflow_definition: dict[str, Any]) -> list[ValidationFinding]:
        """Convert JSON Schema errors into individual ValidationFinding objects."""
        findings: list[ValidationFinding] = []
        for error in _get_validator().iter_errors(workflow_definition):
            path_parts = list(error.absolute_path)

            if error.context:
                best_msgs = _best_branch_messages(error)
                best_msgs.extend(_get_nested_parameter_errors(error, workflow_definition, best_msgs))
                for leaf_msg in best_msgs:
                    node_id, field_path = _extract_node_id_and_field(path_parts, workflow_definition)
                    findings.append(
                        ValidationFinding(
                            severity=ValidationSeverity.error,
                            category=ValidationCategory.schema_violation,
                            message=leaf_msg,
                            node_id=node_id,
                            field_path=field_path,
                        )
                    )
            else:
                node_id, field_path = _extract_node_id_and_field(path_parts, workflow_definition)
                findings.append(
                    ValidationFinding(
                        severity=ValidationSeverity.error,
                        category=ValidationCategory.schema_violation,
                        message=error.message,
                        node_id=node_id,
                        field_path=field_path,
                    )
                )
        return findings

    def collect_findings(self, workflow_definition: dict[str, Any]) -> ValidationResult:
        """Run all validation checks and return a structured ValidationResult.

        Args:
            workflow_definition: Workflow definition dictionary to validate

        Returns:
            ValidationResult with individual findings, counts, and validity

        """
        return ValidationResult.from_findings(self._collect_findings(workflow_definition))

    def collect_validation_issues(self, workflow_definition: dict[str, Any]) -> WorkflowValidationResult:
        """Run all validation checks and collect issues instead of raising.

        Unlike validate_workflow_definition(), this method does not raise on the
        first error. It runs every applicable validator and returns a structured
        result with errors and warnings separated.

        JSON Schema errors for the same element (e.g. ``nodes.0``) are grouped
        into a single ``ValidationIssue`` with all sub-errors listed.

        Args:
            workflow_definition: Workflow definition dictionary to validate

        Returns:
            WorkflowValidationResult with errors, warnings, and validity flag

        """
        findings = self._collect_findings(workflow_definition)
        id_index = _build_node_id_index(workflow_definition)
        errors: list[ValidationIssue] = []
        warnings: list[ValidationIssue] = []

        schema_groups: dict[str, list[str]] = defaultdict(list)

        for f in findings:
            if f.category == ValidationCategory.schema_violation:
                element_key = id_index.get(f.node_id) if f.node_id else None
                if element_key:
                    schema_groups[element_key].append(f.message)
                else:
                    path = f.field_path or ""
                    msg = f"{path}: {f.message}" if path else f.message
                    errors.append(ValidationIssue(message=msg))
            elif f.severity == ValidationSeverity.error:
                errors.append(ValidationIssue(message=f.message, node_id=f.node_id))
            else:
                warnings.append(ValidationIssue(message=f.message, node_id=f.node_id))

        for element_key, messages in schema_groups.items():
            summary = _element_summary(element_key, workflow_definition)
            error_list = ", ".join(messages)
            msg = f"{element_key}: {summary}, errors:[{error_list}]"
            errors.append(ValidationIssue(message=msg))

        node_ids = _extract_node_ids(workflow_definition)
        errors.extend(check_template_expressions(workflow_definition, node_ids))

        return WorkflowValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)

    def _validate_graph_structure(self, workflow_definition: dict[str, Any], node_ids: set[str]) -> None:
        edge_issues = _check_edge_references(workflow_definition, node_ids)
        if edge_issues:
            raise SafeValueError(edge_issues[0].message)

        cycle_issues = _check_cycles(workflow_definition, node_ids)
        if cycle_issues:
            raise SafeValueError(cycle_issues[0].message)

        orphan_findings = _check_orphaned_nodes_findings(workflow_definition, node_ids)
        if orphan_findings:
            raise SafeValueError(orphan_findings[0].message)

    def _validate_template_expressions(self, workflow_definition: dict[str, Any], node_ids: set[str]) -> None:
        errors = check_template_expressions(workflow_definition, node_ids)
        if errors:
            raise SafeValueError(errors[0].message)
