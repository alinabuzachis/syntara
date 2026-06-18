"""Tests for WorkflowValidator."""

from typing import Any

import pytest

from nexus.core.exceptions import SafeValueError
from nexus.workflows.models.validation_finding import (
    ValidationCategory,
    ValidationSeverity,
)
from nexus.workflows.validators.workflow_definition import WorkflowValidator


@pytest.fixture
def validator() -> WorkflowValidator:
    """Create a WorkflowValidator instance."""
    return WorkflowValidator()


def _valid_definition() -> dict[str, Any]:
    return {
        "schema_version": "2.0.0",
        "name": "test-workflow",
        "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
        "nodes": [{"id": "n1", "type": "script", "parameters": {"language": "python", "code": "print(1)"}}],
        "edges": [{"from": "t1", "to": "n1"}],
    }


class TestValidWorkflowDefinition:
    """Valid V2 workflow definition passes validation."""

    def test_valid_definition_passes(self, validator: WorkflowValidator) -> None:
        validator.validate_workflow_definition(_valid_definition())

    def test_minimal_valid_definition(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "minimal",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [],
            "edges": [],
        }
        validator.validate_workflow_definition(definition)


class TestMissingSchemaVersion:
    """Missing or wrong schema_version."""

    def test_missing_schema_version_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)

    def test_wrong_schema_version_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "1.0.0", "triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)

    def test_none_schema_version_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": None, "triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError):
            validator.validate_workflow_definition(definition)


class TestMissingRequiredFields:
    """Missing triggers, nodes, or edges fields."""

    def test_missing_triggers_raises(self, validator: WorkflowValidator) -> None:
        definition = {"schema_version": "2.0.0", "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="triggers"):
            validator.validate_workflow_definition(definition)

    def test_missing_nodes_raises(self, validator: WorkflowValidator) -> None:
        definition = {"schema_version": "2.0.0", "triggers": [], "edges": []}
        with pytest.raises(SafeValueError, match="nodes"):
            validator.validate_workflow_definition(definition)

    def test_missing_edges_raises(self, validator: WorkflowValidator) -> None:
        definition = {"schema_version": "2.0.0", "triggers": [], "nodes": []}
        with pytest.raises(SafeValueError, match="edges"):
            validator.validate_workflow_definition(definition)


class TestWorkflowNameValidation:
    """Workflow name validation."""

    def test_valid_name_passes(self, validator: WorkflowValidator) -> None:
        validator.validate_workflow_name("my-workflow")

    def test_empty_name_raises(self, validator: WorkflowValidator) -> None:
        with pytest.raises(SafeValueError, match="cannot be empty"):
            validator.validate_workflow_name("")

    def test_whitespace_only_name_passes(self, validator: WorkflowValidator) -> None:
        """Non-empty string with whitespace is accepted (not stripped)."""
        validator.validate_workflow_name("  ")


class TestEmptyDefinition:
    """Completely empty definition dict."""

    def test_empty_dict_raises_on_schema_version(self, validator: WorkflowValidator) -> None:
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition({})


class TestValidationOrder:
    """Schema version is validated before required fields."""

    def test_bad_version_with_missing_fields_raises_version_error(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "1.0.0"}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)


class TestExtraTopLevelFields:
    """Extra top-level fields are rejected by additionalProperties: false."""

    def test_extra_top_level_fields_rejected(self, validator: WorkflowValidator) -> None:
        definition = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [],
            "edges": [],
            "metadata": {"author": "test"},
        }
        with pytest.raises(SafeValueError, match="schema validation failed"):
            validator.validate_workflow_definition(definition)

    def test_description_field_accepted(self, validator: WorkflowValidator) -> None:
        definition = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [],
            "edges": [],
            "description": "some workflow",
        }
        validator.validate_workflow_definition(definition)

    def test_null_description_accepted(self, validator: WorkflowValidator) -> None:
        """Null description is valid — minLength only applies to strings in Draft 2020-12."""
        definition = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [],
            "edges": [],
            "description": None,
        }
        validator.validate_workflow_definition(definition)


class TestSchemaValidation:
    """JSON schema validation catches structural violations."""

    def test_fabricated_node_type_rejected(self, validator: WorkflowValidator) -> None:
        definition = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "totally_fake_type", "parameters": {}}],
            "edges": [{"from": "t1", "to": "n1"}],
        }
        with pytest.raises(SafeValueError, match="schema validation failed"):
            validator.validate_workflow_definition(definition)

    def test_node_missing_config_rejected(self, validator: WorkflowValidator) -> None:
        definition = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "script"}],
            "edges": [{"from": "t1", "to": "n1"}],
        }
        with pytest.raises(SafeValueError, match="schema validation failed"):
            validator.validate_workflow_definition(definition)

    def test_invalid_node_id_pattern_rejected(self, validator: WorkflowValidator) -> None:
        definition = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {"id": "123-bad!", "type": "script", "parameters": {"language": "python", "code": "x"}},
            ],
            "edges": [{"from": "t1", "to": "n1"}],
        }
        with pytest.raises(SafeValueError, match="schema validation failed"):
            validator.validate_workflow_definition(definition)

    def test_extra_edge_properties_rejected(self, validator: WorkflowValidator) -> None:
        definition = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "script", "parameters": {"language": "python", "code": "x"}}],
            "edges": [{"from": "t1", "to": "n1", "color": "red", "weight": 5}],
        }
        with pytest.raises(SafeValueError, match="schema validation failed"):
            validator.validate_workflow_definition(definition)

    def test_empty_triggers_rejected(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [],
            "nodes": [],
            "edges": [],
        }
        with pytest.raises(SafeValueError, match="schema validation failed"):
            validator.validate_workflow_definition(definition)


class TestEdgeReferences:
    """Edges must reference existing triggers or nodes."""

    def test_edge_from_references_nonexistent_node_rejected(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "bad-from",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "script", "parameters": {"language": "python", "code": "1"}}],
            "edges": [{"from": "ghost", "to": "n1"}],
        }
        with pytest.raises(SafeValueError, match="non-existent node 'ghost'"):
            validator.validate_workflow_definition(definition)

    def test_edge_to_references_nonexistent_node_rejected(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "bad-to",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "script", "parameters": {"language": "python", "code": "1"}}],
            "edges": [{"from": "t1", "to": "missing"}],
        }
        with pytest.raises(SafeValueError, match="non-existent node 'missing'"):
            validator.validate_workflow_definition(definition)


class TestCycleDetection:
    """Cycle detection rejects cyclic workflow graphs."""

    def test_simple_cycle_rejected(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "cycle-test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {"id": "a", "type": "script", "parameters": {"language": "python", "code": "1"}},
                {"id": "b", "type": "script", "parameters": {"language": "python", "code": "2"}},
                {"id": "c", "type": "script", "parameters": {"language": "python", "code": "3"}},
            ],
            "edges": [
                {"from": "t1", "to": "a"},
                {"from": "a", "to": "b"},
                {"from": "b", "to": "c"},
                {"from": "c", "to": "a"},
            ],
        }
        with pytest.raises(SafeValueError, match="cycle"):
            validator.validate_workflow_definition(definition)

    def test_self_loop_rejected(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "self-loop",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {"id": "a", "type": "script", "parameters": {"language": "python", "code": "1"}},
            ],
            "edges": [
                {"from": "t1", "to": "a"},
                {"from": "a", "to": "a"},
            ],
        }
        with pytest.raises(SafeValueError, match="cycle"):
            validator.validate_workflow_definition(definition)

    def test_valid_dag_passes(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "dag",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {"id": "a", "type": "script", "parameters": {"language": "python", "code": "1"}},
                {"id": "b", "type": "script", "parameters": {"language": "python", "code": "2"}},
                {"id": "c", "type": "script", "parameters": {"language": "python", "code": "3"}},
            ],
            "edges": [
                {"from": "t1", "to": "a"},
                {"from": "a", "to": "b"},
                {"from": "b", "to": "c"},
            ],
        }
        validator.validate_workflow_definition(definition)

    def test_loop_feedback_edge_allowed(self, validator: WorkflowValidator) -> None:
        """Edges with to_port='iterate' are intentional loop-back edges and must not trigger cycle detection."""
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "loop-workflow",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "loop_node",
                    "type": "loop",
                    "parameters": {"type": "for_each", "items": "${t1.result.items}"},
                },
                {"id": "body", "type": "script", "parameters": {"language": "python", "code": "1"}},
            ],
            "edges": [
                {"from": "t1", "to": "loop_node"},
                {"from": "loop_node", "to": "body", "from_port": "iterate"},
                {"from": "body", "to": "loop_node", "to_port": "iterate"},
            ],
        }
        validator.validate_workflow_definition(definition)


class TestSchemaVersionVariants:
    """Various schema_version format edge cases."""

    def test_version_2_0_without_patch_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "2.0", "triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)

    def test_version_3_0_0_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "3.0.0", "triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)

    def test_integer_version_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": 2, "triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)


class TestCollectValidationIssues:
    """collect_validation_issues() returns all issues instead of raising on the first."""

    def test_valid_definition_returns_empty(self, validator: WorkflowValidator) -> None:
        result = validator.collect_validation_issues(_valid_definition())
        assert result.valid is True
        assert result.errors == []
        assert result.warnings == []

    def test_invalid_schema_version_returns_error(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "1.0.0", "triggers": [], "nodes": [], "edges": []}
        result = validator.collect_validation_issues(definition)
        assert result.valid is False
        assert len(result.errors) == 1
        assert "schema_version" in result.errors[0].message.lower()

    def test_missing_multiple_fields_collects_all(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "2.0.0"}
        result = validator.collect_validation_issues(definition)
        assert result.valid is False
        messages = [i.message for i in result.errors]
        assert any("triggers" in m for m in messages)
        assert any("nodes" in m for m in messages)
        assert any("edges" in m for m in messages)

    def test_edge_reference_errors_include_node_id(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "script", "parameters": {"language": "python", "code": "1"}}],
            "edges": [{"from": "t1", "to": "ghost"}],
        }
        result = validator.collect_validation_issues(definition)
        assert result.valid is False
        edge_errors = [i for i in result.errors if i.node_id == "ghost"]
        assert len(edge_errors) == 1

    def test_cycle_detected_as_error(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "cycle",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {"id": "a", "type": "script", "parameters": {"language": "python", "code": "1"}},
                {"id": "b", "type": "script", "parameters": {"language": "python", "code": "2"}},
            ],
            "edges": [
                {"from": "t1", "to": "a"},
                {"from": "a", "to": "b"},
                {"from": "b", "to": "a"},
            ],
        }
        result = validator.collect_validation_issues(definition)
        assert result.valid is False
        cycle_errors = [i for i in result.errors if "cycle" in i.message.lower()]
        assert len(cycle_errors) == 1

    def test_orphaned_node_reported_as_warning(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "orphan",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {"id": "n1", "type": "script", "parameters": {"language": "python", "code": "1"}},
                {"id": "orphan", "type": "script", "parameters": {"language": "python", "code": "2"}},
            ],
            "edges": [{"from": "t1", "to": "n1"}],
        }
        result = validator.collect_validation_issues(definition)
        assert result.valid is True
        assert len(result.warnings) == 1
        assert result.warnings[0].node_id == "orphan"

    def test_schema_validation_errors_collected(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "totally_fake_type", "parameters": {}}],
            "edges": [{"from": "t1", "to": "n1"}],
        }
        result = validator.collect_validation_issues(definition)
        assert result.valid is False
        assert len(result.errors) == 1

    def test_schema_errors_grouped_by_node(self, validator: WorkflowValidator) -> None:
        """Multiple JSON Schema errors on the same node are grouped into one ValidationIssue."""
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "123_bad_id", "type": "script", "name": "Bad ID", "config": {}}],
            "edges": [{"from": "t1", "to": "123_bad_id"}],
        }
        result = validator.collect_validation_issues(definition)
        assert result.valid is False
        node_errors = [e for e in result.errors if "nodes.0:" in e.message]
        assert len(node_errors) == 1
        msg = node_errors[0].message
        assert "errors:[" in msg
        assert "Unevaluated properties are not allowed" in msg
        assert "'parameters' is a required property" in msg
        assert "does not match" in msg

    def test_edge_errors_not_grouped_with_node(self, validator: WorkflowValidator) -> None:
        """Edge-level errors remain separate from node-level grouped errors."""
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "123_bad_id", "type": "script", "name": "Bad ID", "config": {}}],
            "edges": [{"from": "t1", "to": "123_bad_id"}],
        }
        result = validator.collect_validation_issues(definition)
        edge_errors = [e for e in result.errors if "edges." in e.message]
        assert len(edge_errors) == 1
        assert "does not match" in edge_errors[0].message


class TestCollectFindings:
    """collect_findings() returns structured ValidationResult with individual findings."""

    def test_valid_definition_returns_empty_findings(self, validator: WorkflowValidator) -> None:
        result = validator.collect_findings(_valid_definition())
        assert result.is_valid is True
        assert result.error_count == 0
        assert result.warning_count == 0
        assert result.findings == []

    def test_orphaned_node_finding(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "orphan",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {"id": "n1", "type": "script", "parameters": {"language": "python", "code": "1"}},
                {"id": "orphan", "type": "script", "parameters": {"language": "python", "code": "2"}},
            ],
            "edges": [{"from": "t1", "to": "n1"}],
        }
        result = validator.collect_findings(definition)
        assert result.is_valid is True
        assert result.warning_count == 1
        finding = result.findings[0]
        assert finding.severity == ValidationSeverity.warning
        assert finding.category == ValidationCategory.orphaned_node
        assert finding.node_id == "orphan"

    def test_multiple_schema_findings_per_node(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "123_bad_id", "type": "script", "name": "Bad ID", "config": {}}],
            "edges": [{"from": "t1", "to": "123_bad_id"}],
        }
        result = validator.collect_findings(definition)
        assert result.is_valid is False
        node_findings = [f for f in result.findings if f.node_id == "123_bad_id"]
        assert len(node_findings) >= 3
        assert all(f.category == ValidationCategory.schema_violation for f in node_findings)

    def test_missing_parameters_includes_nested_required_fields(self, validator: WorkflowValidator) -> None:
        """When parameters is missing, supplementary errors show what it should contain."""
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "script", "config": {}}],
            "edges": [{"from": "t1", "to": "n1"}],
        }
        result = validator.collect_findings(definition)
        messages = [f.message for f in result.findings if f.node_id == "n1"]
        assert "'parameters' is a required property" in messages
        assert "'language' is a required property" in messages
        assert "'code' is a required property" in messages

    def test_schema_version_finding(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "1.0.0", "triggers": [], "nodes": [], "edges": []}
        result = validator.collect_findings(definition)
        assert result.is_valid is False
        assert result.error_count == 1
        assert result.findings[0].category == ValidationCategory.schema_version

    def test_missing_field_findings(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "2.0.0"}
        result = validator.collect_findings(definition)
        assert result.is_valid is False
        categories = [f.category for f in result.findings]
        assert all(c == ValidationCategory.missing_field for c in categories)
        assert result.error_count == 3

    def test_edge_reference_finding(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "script", "parameters": {"language": "python", "code": "1"}}],
            "edges": [{"from": "t1", "to": "ghost"}],
        }
        result = validator.collect_findings(definition)
        assert result.is_valid is False
        ref_findings = [f for f in result.findings if f.category == ValidationCategory.invalid_reference]
        assert len(ref_findings) == 1
        assert ref_findings[0].node_id == "ghost"

    def test_cycle_finding(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "cycle",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {"id": "a", "type": "script", "parameters": {"language": "python", "code": "1"}},
                {"id": "b", "type": "script", "parameters": {"language": "python", "code": "2"}},
            ],
            "edges": [
                {"from": "t1", "to": "a"},
                {"from": "a", "to": "b"},
                {"from": "b", "to": "a"},
            ],
        }
        result = validator.collect_findings(definition)
        assert result.is_valid is False
        cycle_findings = [f for f in result.findings if f.category == ValidationCategory.cycle_detected]
        assert len(cycle_findings) == 1

    def test_json_serialization_shape(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {
            "schema_version": "2.0.0",
            "name": "test",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "script", "parameters": {"language": "python", "code": "1"}}],
            "edges": [{"from": "t1", "to": "ghost"}],
        }
        result = validator.collect_findings(definition)
        data = result.model_dump(mode="json")
        assert "is_valid" in data
        assert "error_count" in data
        assert "warning_count" in data
        assert "findings" in data
        finding = data["findings"][0]
        assert set(finding.keys()) == {"severity", "category", "message", "node_id", "field_path"}
