"""Unit tests for audit event sanitization utilities."""

from typing import Any

from pydantic import BaseModel

from nexus.core.audit.sanitization import (
    EventSanitizer,
    PIIDetector,
    redact_by_partial_key,
    redact_email,
)


class TestRedactByKey:
    """Test the redact_by_partial_key detector function."""

    def test_redacts_exact_matches(self) -> None:
        """Test that exact matches are redacted."""
        detector = redact_by_partial_key(["password", "secret", "token"])

        assert detector("sensitive_data", "password") == "[REDACTED]"
        assert detector("sensitive_data", "secret") == "[REDACTED]"
        assert detector("sensitive_data", "token") == "[REDACTED]"

    def test_redacts_underscore_prefixed_patterns(self) -> None:
        """Test that underscore-prefixed patterns are redacted."""
        detector = redact_by_partial_key(["password", "secret", "token"])

        assert detector("sensitive_data", "_password") == "[REDACTED]"
        assert detector("sensitive_data", "_secret") == "[REDACTED]"
        assert detector("sensitive_data", "_token") == "[REDACTED]"

    def test_redacts_underscore_suffixed_patterns(self) -> None:
        """Test that underscore-suffixed patterns are redacted."""
        detector = redact_by_partial_key(["password", "secret", "token"])

        assert detector("sensitive_data", "password_") == "[REDACTED]"
        assert detector("sensitive_data", "secret_") == "[REDACTED]"
        assert detector("sensitive_data", "token_") == "[REDACTED]"

    def test_redacts_underscore_bounded_patterns(self) -> None:
        """Test that underscore-bounded patterns are redacted."""
        detector = redact_by_partial_key(["password", "secret", "token"])

        assert detector("sensitive_data", "user_password_hash") == "[REDACTED]"
        assert detector("sensitive_data", "api_secret_key") == "[REDACTED]"
        assert detector("sensitive_data", "auth_token_store") == "[REDACTED]"

    def test_redacts_variations_with_underscores(self) -> None:
        """Test that various underscore patterns are redacted."""
        detector = redact_by_partial_key(["password", "key", "auth"])

        # Prefix variations
        assert detector("sensitive", "user_password") == "[REDACTED]"
        assert detector("sensitive", "admin_password") == "[REDACTED]"
        assert detector("sensitive", "api_key") == "[REDACTED]"
        assert detector("sensitive", "encryption_key") == "[REDACTED]"
        assert detector("sensitive", "basic_auth") == "[REDACTED]"

        # Suffix variations
        assert detector("sensitive", "password_hash") == "[REDACTED]"
        assert detector("sensitive", "password_store") == "[REDACTED]"
        assert detector("sensitive", "key_") == "[REDACTED]"
        assert detector("sensitive", "auth_") == "[REDACTED]"

        # Both prefix and suffix
        assert detector("sensitive", "_password_") == "[REDACTED]"
        assert detector("sensitive", "_key_store") == "[REDACTED]"
        assert detector("sensitive", "user_auth_token") == "[REDACTED]"

    def test_case_insensitive_matching(self) -> None:
        """Test that matching is case insensitive."""
        detector = redact_by_partial_key(["password", "secret"])

        assert detector("sensitive", "PASSWORD") == "[REDACTED]"
        assert detector("sensitive", "Password") == "[REDACTED]"
        assert detector("sensitive", "user_PASSWORD") == "[REDACTED]"
        assert detector("sensitive", "API_SECRET") == "[REDACTED]"
        assert detector("sensitive", "_Secret_") == "[REDACTED]"

    def test_ignores_patterns_within_words(self) -> None:
        """Test that patterns within words (no underscore boundaries) are not matched."""
        detector = redact_by_partial_key(["key", "auth", "pass"])

        # These should NOT match - pattern within word without underscore boundaries
        assert detector("data", "keyboard") is None  # "key" in "keyboard"
        assert detector("data", "monkey") is None  # "key" in "monkey"
        assert detector("data", "author") is None  # "auth" in "author"
        assert detector("data", "authentic") is None  # "auth" in "authentic"
        assert detector("data", "passage") is None  # "pass" in "passage"
        assert detector("data", "compass") is None  # "pass" in "compass"

    def test_ignores_non_matching_keys(self) -> None:
        """Test that non-matching keys are not redacted."""
        detector = redact_by_partial_key(["password", "secret"])

        assert detector("some_data", "username") is None
        assert detector("some_data", "email") is None
        assert detector("some_data", "normal_field") is None
        assert detector("some_data", "config_setting") is None

    def test_prevents_bypass_attacks(self) -> None:
        """Test that this detector prevents common bypass attempts."""
        detector = redact_by_partial_key(["password", "secret", "token", "key"])

        # Common bypass variations that would evade exact matching
        assert detector("sensitive", "user_password") == "[REDACTED]"
        assert detector("sensitive", "api_secret") == "[REDACTED]"
        assert detector("sensitive", "auth_token") == "[REDACTED]"
        assert detector("sensitive", "encryption_key") == "[REDACTED]"
        assert detector("sensitive", "client_secret") == "[REDACTED]"
        assert detector("sensitive", "access_token") == "[REDACTED]"
        assert detector("sensitive", "private_key") == "[REDACTED]"
        assert detector("sensitive", "session_secret") == "[REDACTED]"

    def test_empty_patterns(self) -> None:
        """Test behavior with empty patterns list."""
        detector = redact_by_partial_key([])

        assert detector("some_data", "password") is None
        assert detector("some_data", "user_password") is None


class TestRedactEmail:
    """Test the redact_email detector function."""

    def test_redacts_valid_emails(self) -> None:
        """Test that valid email addresses are redacted."""
        assert redact_email("user@example.com", "email") == "[EMAIL_REDACTED]"
        assert redact_email("test.user@company.co.uk", "user_email") == "[EMAIL_REDACTED]"
        assert redact_email("admin@test.org", "contact") == "[EMAIL_REDACTED]"
        assert redact_email("john.doe+newsletter@subdomain.example.com", "email") == "[EMAIL_REDACTED]"
        assert redact_email("user123@localhost.localdomain", "email") == "[EMAIL_REDACTED]"

    def test_ignores_non_email_strings(self) -> None:
        """Test that non-email strings are not redacted."""
        assert redact_email("not_an_email", "email") is None
        assert redact_email("missing@domain", "email") is None
        assert redact_email("user@", "email") is None
        assert redact_email("@domain.com", "email") is None
        assert redact_email("user.name", "email") is None

        # These were false positives in the original simple implementation
        assert redact_email("see RFC 2822 @ section 3.4.1", "text") is None
        assert redact_email("config@v2.0", "version") is None  # No TLD
        assert redact_email("config@v2.0.1", "version") is None  # Numeric TLD (not email)
        assert redact_email("user@host", "config") is None  # No TLD
        assert redact_email("@domain.com", "text") is None  # No local part
        assert redact_email("user@", "text") is None  # No domain

    def test_intentional_over_matching_for_security(self) -> None:
        """Test cases where we intentionally over-match for security (documented behavior)."""
        # These may look like false positives but are intentionally caught for security
        assert redact_email("user@localhost.local", "config") == "[EMAIL_REDACTED]"  # Local email
        assert redact_email("user@service.internal", "config") == "[EMAIL_REDACTED]"  # Internal service email

    def test_email_detection_in_longer_strings(self) -> None:
        """Test email detection within longer text strings."""
        assert redact_email("Contact me at john@example.com for details", "message") == "[EMAIL_REDACTED]"
        assert redact_email("Email: admin@test.org, Phone: 123-456", "contact_info") == "[EMAIL_REDACTED]"
        assert redact_email("Send logs to support@company.co.uk", "instruction") == "[EMAIL_REDACTED]"

    def test_ignores_non_string_values(self) -> None:
        """Test that non-string values are not redacted."""
        assert redact_email(123, "email") is None
        assert redact_email(None, "email") is None
        assert redact_email(["user@example.com"], "email") is None
        assert redact_email({"email": "user@example.com"}, "email") is None

    def test_ignores_key_parameter(self) -> None:
        """Test that the key parameter is ignored (function signature requirement)."""
        assert redact_email("user@example.com", "not_email_key") == "[EMAIL_REDACTED]"
        assert redact_email("user@example.com", "") == "[EMAIL_REDACTED]"


class TestEventSanitizer:
    """Test the EventSanitizer class."""

    def test_initialization_with_defaults(self) -> None:
        """Test sanitizer initialization with default values."""
        sanitizer = EventSanitizer()

        assert sanitizer.detectors == []
        assert sanitizer.max_depth == 10

    def test_initialization_with_custom_values(self) -> None:
        """Test sanitizer initialization with custom values."""
        detectors: list[PIIDetector] = [redact_email, redact_by_partial_key(["secret"])]
        sanitizer = EventSanitizer(detectors=detectors, max_depth=5)

        assert sanitizer.detectors == detectors
        assert sanitizer.max_depth == 5

    def test_sanitize_primitives(self) -> None:
        """Test sanitization of primitive values."""
        detector = redact_by_partial_key(["secret"])
        sanitizer = EventSanitizer(detectors=[detector])

        # Should apply detectors to primitives (exact match and partial)
        assert sanitizer._apply_detectors("value", "secret") == "[REDACTED]"
        assert sanitizer._apply_detectors("value", "normal_key") == "value"
        assert sanitizer._apply_detectors(123, "secret") == "[REDACTED]"
        assert sanitizer._apply_detectors(None, "secret") == "[REDACTED]"

    def test_sanitize_dictionaries(self) -> None:
        """Test sanitization of dictionary objects."""
        sanitizer = EventSanitizer(detectors=[redact_by_partial_key(["password"]), redact_email])

        data = {"username": "john_doe", "password": "secret123", "email": "john@example.com", "age": 30}

        result = sanitizer.sanitize(data)

        assert result["username"] == "john_doe"
        assert result["password"] == "[REDACTED]"  # noqa: S105
        assert result["email"] == "[EMAIL_REDACTED]"
        assert result["age"] == 30

    def test_sanitize_nested_dictionaries(self) -> None:
        """Test sanitization of nested dictionary structures."""
        sanitizer = EventSanitizer(detectors=[redact_by_partial_key(["secret"])])

        data = {"user": {"name": "John", "credentials": {"secret": "sensitive_data"}}, "config": {"debug": True}}

        result = sanitizer.sanitize(data)

        assert result["user"]["name"] == "John"
        assert result["user"]["credentials"]["secret"] == "[REDACTED]"  # noqa: S105
        assert result["config"]["debug"] is True

    def test_sanitize_lists(self) -> None:
        """Test sanitization of list structures."""
        sanitizer = EventSanitizer(detectors=[redact_email])

        data = {"emails": ["john@example.com", "not_an_email", "jane@test.org"], "numbers": [1, 2, 3]}

        result = sanitizer.sanitize(data)

        assert result["emails"] == ["[EMAIL_REDACTED]", "not_an_email", "[EMAIL_REDACTED]"]
        assert result["numbers"] == [1, 2, 3]

    def test_circular_reference_detection(self) -> None:
        """Test handling of circular references."""
        sanitizer = EventSanitizer()

        data: dict[str, Any] = {"key": "value"}
        data["self"] = data  # Create circular reference

        result = sanitizer.sanitize(data)

        assert result["key"] == "value"
        assert result["self"] == "[CIRCULAR]"

    def test_max_depth_limit(self) -> None:
        """Test max depth limit enforcement."""
        sanitizer = EventSanitizer(max_depth=2)

        # Create nested structure deeper than max_depth
        # max_depth=2 allows 2 container objects (root dict + level1 dict),
        # then truncates at level2's value
        data = {"level1": {"level2": {"level3": {"level4": "deep_value"}}}}

        result = sanitizer.sanitize(data)

        assert result["level1"]["level2"] == "[MAX_DEPTH]"

    def test_pydantic_model_handling(self) -> None:
        """Test handling of Pydantic models."""

        class TestModel(BaseModel):
            username: str
            password: str
            email: str

        model = TestModel(username="john", password="secret", email="john@example.com")  # noqa: S106
        sanitizer = EventSanitizer(detectors=[redact_by_partial_key(["password"]), redact_email])

        # Convert to dict first since sanitize now expects dict input
        model_dict = model.model_dump()
        result = sanitizer.sanitize(model_dict)

        assert result["username"] == "john"
        assert result["password"] == "[REDACTED]"  # noqa: S105
        assert result["email"] == "[EMAIL_REDACTED]"

    def test_bytes_handling(self) -> None:
        """Test handling of bytes and bytearray objects."""
        sanitizer = EventSanitizer()

        data = {"binary_data": b"hello world", "byte_array": bytearray(b"test data")}

        result = sanitizer.sanitize(data)

        assert result["binary_data"] == "hello world"
        assert result["byte_array"] == "test data"

    def test_bytes_with_invalid_utf8(self) -> None:
        """Test handling of bytes with invalid UTF-8."""
        sanitizer = EventSanitizer()

        data = {"invalid_utf8": b"\xff\xfe"}
        result = sanitizer.sanitize(data)

        # Should handle invalid UTF-8 gracefully
        assert isinstance(result["invalid_utf8"], str)

    def test_fallback_string_conversion(self) -> None:
        """Test fallback string conversion for unknown types."""

        class CustomObject:
            def __str__(self) -> str:
                return "custom_object_string"

        sanitizer = EventSanitizer()
        data = {"custom": CustomObject()}

        result = sanitizer.sanitize(data)
        assert result["custom"] == "custom_object_string"

    def test_multiple_detectors(self) -> None:
        """Test that multiple detectors are applied in order."""

        def first_detector(value: object, key: str) -> str | None:
            if key == "special":
                return "[FIRST_DETECTOR]"
            return None

        def second_detector(value: object, key: str) -> str | None:
            if key == "special":
                return "[SECOND_DETECTOR]"  # Should not be reached
            return None

        sanitizer = EventSanitizer(detectors=[first_detector, second_detector])
        result = sanitizer._apply_detectors("value", "special")

        # First detector should take precedence
        assert result == "[FIRST_DETECTOR]"

    def test_no_detectors(self) -> None:
        """Test sanitization with no detectors configured."""
        sanitizer = EventSanitizer(detectors=[])

        data = {"password": "secret", "email": "user@example.com", "normal": "data"}

        result = sanitizer.sanitize(data)

        # Nothing should be redacted
        assert result == data


class TestPIIDetectorType:
    """Test the PIIDetector type alias."""

    def test_custom_detector_implementation(self) -> None:
        """Test implementing a custom detector following the PIIDetector interface."""

        def custom_detector(value: object, key: str) -> str | None:
            if key == "custom_field" and isinstance(value, str):
                return f"[CUSTOM:{len(value)}]"
            return None

        # Verify it matches the PIIDetector type
        detector: PIIDetector = custom_detector

        sanitizer = EventSanitizer(detectors=[detector])
        result = sanitizer.sanitize({"custom_field": "test_data"})

        assert result["custom_field"] == "[CUSTOM:9]"


class TestEdgeCases:
    """Test edge cases and error conditions."""

    def test_empty_dictionary(self) -> None:
        """Test sanitization of empty dictionary."""
        sanitizer = EventSanitizer(detectors=[redact_by_partial_key(["password"])])
        result = sanitizer.sanitize({})
        assert result == {}

    def test_none_values(self) -> None:
        """Test handling of None values."""
        detector = redact_by_partial_key(["secret"])
        sanitizer = EventSanitizer(detectors=[detector])

        # Test separate None values to avoid circular reference issues
        data1 = {"secret": None}
        result1 = sanitizer.sanitize(data1)
        assert result1["secret"] == "[REDACTED]"  # noqa: S105

        data2 = {"normal_key": None}
        result2 = sanitizer.sanitize(data2)
        assert result2["normal_key"] is None

    def test_nested_empty_structures(self) -> None:
        """Test handling of nested empty structures."""
        sanitizer = EventSanitizer()

        data = {"empty_dict": {}, "empty_list": [], "nested": {"also_empty": {}, "list_empty": []}}

        result = sanitizer.sanitize(data)
        assert result == data

    def test_deeply_nested_structure(self) -> None:
        """Test deeply nested structure within depth limit."""
        # 6 container objects: root → level1 → level2 → level3 → level4 → {secret: ...}
        sanitizer = EventSanitizer(detectors=[redact_by_partial_key(["secret"])], max_depth=6)

        data = {"level1": {"level2": {"level3": {"level4": {"secret": "should_be_redacted"}}}}}

        result = sanitizer.sanitize(data)
        assert result["level1"]["level2"]["level3"]["level4"]["secret"] == "[REDACTED]"  # noqa: S105

    def test_mixed_type_lists(self) -> None:
        """Test lists with mixed types."""
        sanitizer = EventSanitizer(detectors=[redact_email])

        data = {
            "mixed_list": [
                "john@example.com",
                123,
                {"nested_email": "jane@test.com"},
                None,
                ["nested_list_email@domain.org"],
            ]
        }

        result = sanitizer.sanitize(data)

        assert result["mixed_list"][0] == "[EMAIL_REDACTED]"
        assert result["mixed_list"][1] == 123
        assert result["mixed_list"][2]["nested_email"] == "[EMAIL_REDACTED]"
        assert result["mixed_list"][3] is None
        assert result["mixed_list"][4][0] == "[EMAIL_REDACTED]"


class TestCircularReferenceHandling:
    """Test comprehensive circular reference detection and handling."""

    def test_primitive_values_can_repeat(self) -> None:
        """Test that primitive values can appear multiple times without being flagged as circular."""
        sanitizer = EventSanitizer()

        # This should NOT be marked as circular since "test" is just a string
        # that appears in two different places
        data = {"function_args": {"value": "test"}, "function_result": {"result": "test"}}

        result = sanitizer.sanitize(data)

        # Both occurrences should preserve the original value
        assert result["function_args"]["value"] == "test"
        assert result["function_result"]["result"] == "test"

    def test_multiple_primitive_types_can_repeat(self) -> None:
        """Test that all primitive types can appear multiple times."""
        sanitizer = EventSanitizer()

        data = {
            "str1": "test",
            "str2": "test",
            "int1": 42,
            "int2": 42,
            "float1": 3.14,
            "float2": 3.14,
            "bool1": True,
            "bool2": True,
            "none1": None,
            "none2": None,
        }

        result = sanitizer.sanitize(data)

        # All should be preserved without being marked as circular
        assert result["str1"] == "test"
        assert result["str2"] == "test"
        assert result["int1"] == 42
        assert result["int2"] == 42
        assert result["float1"] == 3.14
        assert result["float2"] == 3.14
        assert result["bool1"] is True
        assert result["bool2"] is True
        assert result["none1"] is None
        assert result["none2"] is None

    def test_actual_circular_reference_detection(self) -> None:
        """Test that actual circular references are properly detected."""
        sanitizer = EventSanitizer()

        # Create actual circular reference
        data: dict[str, Any] = {"name": "root"}
        data["self"] = data  # This creates a real circular reference

        container = {"circular_data": data}

        result = sanitizer.sanitize(container)

        # Should detect the circular reference
        assert result["circular_data"]["name"] == "root"
        assert result["circular_data"]["self"] == "[CIRCULAR]"

    def test_shared_object_reference_allowed(self) -> None:
        """Test that the same object shared in multiple places is allowed (not circular)."""
        sanitizer = EventSanitizer()

        shared_list = [1, 2, 3]
        data = {
            "list1": shared_list,
            "list2": shared_list,  # Same object in two places - this is NOT circular
        }

        result = sanitizer.sanitize(data)

        # Both occurrences should be preserved
        assert result["list1"] == [1, 2, 3]
        assert result["list2"] == [1, 2, 3]

    def test_complex_nested_structure_with_repeated_primitives(self) -> None:
        """Test complex nested structures where primitive values appear multiple times."""
        sanitizer = EventSanitizer()

        user_id = "user123"
        data = {
            "user": {"id": user_id, "preferences": {"theme": "dark", "language": "en"}},
            "session": {
                "user_id": user_id,  # Same string value
                "settings": {
                    "theme": "dark",  # Same string value
                    "auto_save": True,
                },
            },
            "audit": {
                "user_id": user_id,  # Same string value again
                "theme_preference": "dark",  # Same string value again
            },
        }

        result = sanitizer.sanitize(data)

        # All primitive values should be preserved
        assert result["user"]["id"] == "user123"
        assert result["session"]["user_id"] == "user123"
        assert result["audit"]["user_id"] == "user123"
        assert result["user"]["preferences"]["theme"] == "dark"
        assert result["session"]["settings"]["theme"] == "dark"
        assert result["audit"]["theme_preference"] == "dark"

    def test_mixed_shared_objects_and_circular_references(self) -> None:
        """Test scenario with both shared objects and actual circular references."""
        sanitizer = EventSanitizer()

        # Create a structure with shared objects (allowed) and actual circular references
        shared_dict = {"value": "shared_string"}
        circular_dict: dict[str, Any] = {"name": "circular"}
        circular_dict["self"] = circular_dict  # True circular reference

        data = {
            "string1": "shared_string",  # Repeated primitive - should be OK
            "string2": "shared_string",  # Repeated primitive - should be OK
            "dict1": shared_dict,  # First reference to shared object - OK
            "dict2": shared_dict,  # Second reference to shared object - OK (not circular)
            "circular": circular_dict,  # Object with circular reference
        }

        result = sanitizer.sanitize(data)

        # Primitives should be preserved
        assert result["string1"] == "shared_string"
        assert result["string2"] == "shared_string"

        # Shared object references should both be preserved (not circular)
        assert result["dict1"]["value"] == "shared_string"
        assert result["dict2"]["value"] == "shared_string"

        # But actual circular reference should be detected
        assert result["circular"]["name"] == "circular"
        assert result["circular"]["self"] == "[CIRCULAR]"
