"""Unit tests for JSON Schema validation helpers.

Tests cover:
- Definition-time validation (meta-schema, $ref rejection, ReDoS detection)
- Runtime payload validation with $ref resolution blocked
"""

import pytest
from referencing.exceptions import Unresolvable

from nexus.workflows.json_schema_validation import (
    _has_dangerous_pattern,
    validate_json_schema_definition,
    validate_payload_against_schema,
)

# ============================================================================
# validate_json_schema_definition
# ============================================================================


class TestValidateJsonSchemaDefinition:
    """Test suite for definition-time schema validation."""

    def test_valid_schema_passes(self) -> None:
        """A well-formed Draft-07 schema should pass validation."""
        schema = {
            "type": "object",
            "properties": {"event": {"type": "string"}},
            "required": ["event"],
        }
        # Should not raise
        validate_json_schema_definition(schema)

    def test_valid_schema_with_pattern_passes(self) -> None:
        """A schema with a safe regex pattern should pass."""
        schema = {
            "type": "object",
            "properties": {
                "email": {
                    "type": "string",
                    "pattern": r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$",
                },
            },
        }
        validate_json_schema_definition(schema)

    def test_empty_object_schema_passes(self) -> None:
        """A minimal schema with just a type should pass."""
        validate_json_schema_definition({"type": "object"})

    def test_invalid_meta_schema_raises(self) -> None:
        """A structurally invalid schema should be rejected."""
        schema = {"type": "not_a_valid_type"}
        with pytest.raises(ValueError, match="Invalid JSON Schema"):
            validate_json_schema_definition(schema)

    def test_ref_at_top_level_rejected(self) -> None:
        """A $ref at the top level should be rejected."""
        schema = {"$ref": "http://internal-service/secret"}
        with pytest.raises(ValueError, match=r"\$ref"):
            validate_json_schema_definition(schema)

    def test_ref_in_properties_rejected(self) -> None:
        """A $ref nested inside properties should be rejected."""
        schema = {
            "type": "object",
            "properties": {
                "data": {"$ref": "http://malicious.example.com/schema"},
            },
        }
        with pytest.raises(ValueError, match=r"\$ref"):
            validate_json_schema_definition(schema)

    def test_ref_in_items_rejected(self) -> None:
        """A $ref inside array items should be rejected."""
        schema = {
            "type": "array",
            "items": {"$ref": "#/definitions/Thing"},
        }
        with pytest.raises(ValueError, match=r"\$ref"):
            validate_json_schema_definition(schema)

    def test_ref_in_allof_rejected(self) -> None:
        """A $ref inside allOf should be rejected."""
        schema = {
            "allOf": [
                {"type": "object"},
                {"$ref": "https://example.com/base.json"},
            ],
        }
        with pytest.raises(ValueError, match=r"\$ref"):
            validate_json_schema_definition(schema)

    def test_local_ref_rejected(self) -> None:
        """Even local JSON Pointer $ref should be rejected."""
        schema = {
            "type": "object",
            "properties": {
                "child": {"$ref": "#/definitions/Child"},
            },
            "definitions": {
                "Child": {"type": "string"},
            },
        }
        with pytest.raises(ValueError, match=r"\$ref"):
            validate_json_schema_definition(schema)

    def test_invalid_regex_pattern_rejected(self) -> None:
        """A pattern with invalid regex syntax should be rejected.

        Draft-07 meta-schema validation catches invalid regex patterns
        via the ``format: regex`` check before our walker runs.
        """
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string", "pattern": "[invalid"},
            },
        }
        with pytest.raises(ValueError, match="Invalid JSON Schema"):
            validate_json_schema_definition(schema)

    def test_redos_nested_quantifier_rejected(self) -> None:
        """A pattern with nested quantifiers (ReDoS) should be rejected."""
        schema = {
            "type": "object",
            "properties": {
                "data": {"type": "string", "pattern": "(a+)+$"},
            },
        }
        with pytest.raises(ValueError, match="Potentially unsafe regex"):
            validate_json_schema_definition(schema)

    def test_redos_nested_star_rejected(self) -> None:
        """Nested star quantifiers should be rejected."""
        schema = {
            "type": "object",
            "properties": {
                "data": {"type": "string", "pattern": "(x*y*)*z"},
            },
        }
        with pytest.raises(ValueError, match="Potentially unsafe regex"):
            validate_json_schema_definition(schema)

    def test_pattern_in_nested_schema_checked(self) -> None:
        """Dangerous patterns in deeply nested schemas should still be caught."""
        schema = {
            "type": "object",
            "properties": {
                "outer": {
                    "type": "object",
                    "properties": {
                        "inner": {
                            "type": "string",
                            "pattern": "(a+)+",
                        },
                    },
                },
            },
        }
        with pytest.raises(ValueError, match="Potentially unsafe regex"):
            validate_json_schema_definition(schema)

    def test_safe_quantifiers_pass(self) -> None:
        """Non-nested quantifiers should be allowed."""
        schema = {
            "type": "object",
            "properties": {
                "id": {"type": "string", "pattern": r"^[a-z0-9]+$"},
                "version": {"type": "string", "pattern": r"^\d{1,3}\.\d{1,3}$"},
            },
        }
        validate_json_schema_definition(schema)

    def test_pattern_properties_redos_rejected(self) -> None:
        """A patternProperties key with nested quantifiers should be rejected."""
        schema = {
            "type": "object",
            "patternProperties": {
                "(a+)+$": {"type": "string"},
            },
        }
        with pytest.raises(ValueError, match="Potentially unsafe regex"):
            validate_json_schema_definition(schema)

    def test_pattern_properties_invalid_regex_rejected(self) -> None:
        """A patternProperties key with invalid regex should be rejected.

        Draft-07 meta-schema validation catches invalid regex in
        patternProperties keys via the ``format: regex`` check.
        """
        schema = {
            "type": "object",
            "patternProperties": {
                "[invalid": {"type": "string"},
            },
        }
        with pytest.raises(ValueError, match="Invalid JSON Schema"):
            validate_json_schema_definition(schema)

    def test_pattern_properties_safe_key_passes(self) -> None:
        """A patternProperties key with a safe regex should pass."""
        schema = {
            "type": "object",
            "patternProperties": {
                r"^[a-z]+$": {"type": "string"},
            },
        }
        validate_json_schema_definition(schema)


# ============================================================================
# _has_dangerous_pattern
# ============================================================================


class TestHasDangerousPattern:
    """Test the ReDoS heuristic directly."""

    @pytest.mark.parametrize(
        "pattern",
        [
            "(a+)+",
            "(a+)+$",
            "(x*y*)*z",
            "(a|b+)*c",
            "(a{2,})+",
        ],
    )
    def test_dangerous_patterns_detected(self, pattern: str) -> None:
        """Known ReDoS patterns should be flagged."""
        assert _has_dangerous_pattern(pattern) is True

    @pytest.mark.parametrize(
        "pattern",
        [
            r"^[a-z]+$",
            r"^\d{3}-\d{4}$",
            r"^(foo|bar)$",
            r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+",
            r"^\w+$",
        ],
    )
    def test_safe_patterns_pass(self, pattern: str) -> None:
        """Safe regex patterns should not be flagged."""
        assert _has_dangerous_pattern(pattern) is False


# ============================================================================
# validate_payload_against_schema — runtime
# ============================================================================


class TestValidatePayloadAgainstSchema:
    """Test suite for runtime payload validation."""

    def test_valid_payload_passes(self) -> None:
        """A conforming payload should pass."""
        schema = {
            "type": "object",
            "properties": {"event": {"type": "string"}},
            "required": ["event"],
        }
        # Should not raise
        validate_payload_against_schema({"event": "push"}, schema)

    def test_invalid_payload_raises(self) -> None:
        """A non-conforming payload should raise ValidationError."""
        import jsonschema

        schema = {
            "type": "object",
            "properties": {"event": {"type": "string"}},
            "required": ["event"],
        }
        with pytest.raises(jsonschema.ValidationError):
            validate_payload_against_schema({"wrong": 123}, schema)

    def test_ref_resolution_blocked(self) -> None:
        """$ref resolution should raise Unresolvable at runtime."""
        schema = {
            "type": "object",
            "properties": {
                "data": {"$ref": "http://internal-service/secret"},
            },
        }
        with pytest.raises(Unresolvable):
            validate_payload_against_schema({"data": "test"}, schema)

    def test_local_ref_resolves_within_schema(self) -> None:
        """Local JSON Pointer $ref resolves within the schema itself.

        Local ``#/definitions/...`` references are resolved against the
        schema document, not via the registry, so they don't trigger
        the ``$ref`` blocker. This is acceptable because definition-time
        validation rejects all ``$ref`` keys unconditionally.
        """
        schema = {
            "type": "object",
            "properties": {
                "child": {"$ref": "#/definitions/Child"},
            },
            "definitions": {
                "Child": {"type": "string"},
            },
        }
        # Local ref resolves without hitting the registry
        validate_payload_against_schema({"child": "test"}, schema)
