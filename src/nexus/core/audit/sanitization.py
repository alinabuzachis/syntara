"""Audit event data sanitization utilities with pluggable PII detectors."""

import re
from collections.abc import Callable, Mapping, Sequence
from typing import Any, cast

from pydantic import BaseModel

# PII Detector Interface
PIIDetector = Callable[[Any, str], Any | None]

# Compiled regex pattern for email detection - more efficient than compiling on each call
# Matches: word chars/dots/hyphens + @ + word chars/dots/hyphens + . + 2+ word chars
# Uses word boundaries and proper validation while being aggressive for security
EMAIL_PATTERN = re.compile(r"\b[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")


def redact_by_partial_key(patterns: list[str]) -> PIIDetector:
    """Create a detector that redacts values based on partial key matching with word boundaries.

    This detector checks if any of the provided patterns appear in the key name
    with underscore word boundaries (case-insensitive). This prevents trivial bypass
    of exact-match redaction while avoiding false positives from substring matching.

    Security Note: Matches patterns with underscore boundaries like:
    - password -> user_password, password_, _password, _password_
    - secret -> api_secret_, _secret, client_secret, _secret_key
    - token -> _auth_token, access_token_, _token_, token_value

    Does NOT match patterns within words (e.g., 'password' won't match 'passwords123').

    Args:
        patterns: List of sensitive terms to match within key names

    Returns:
        PIIDetector function that redacts values for keys containing any pattern with boundaries

    """
    patterns_lower = tuple(p.lower() for p in patterns)

    def detector(_: Any, key: str) -> Any | None:  # noqa: ANN401
        key_lower = key.lower()

        for pattern in patterns_lower:
            # Check for pattern with underscore boundaries or at start/end of key
            if (
                key_lower == pattern  # exact match
                or key_lower.startswith(pattern + "_")  # pattern_*
                or key_lower.endswith("_" + pattern)  # *_pattern
                or ("_" + pattern + "_") in key_lower
            ):  # *_pattern_*
                return "[REDACTED]"

        return None

    return detector


def redact_email(value: Any, _: str) -> Any | None:  # noqa: ANN401
    """Detect and redact email addresses.

    Uses a pattern that catches most valid email formats while intentionally
    being more aggressive to avoid leaking PII. May redact some non-email strings
    that contain email-like patterns (e.g. "user@host.local", "config@v2.0.1").
    This over-matching is intentional for security - better to redact non-emails
    than to leak actual email addresses.
    """
    if not isinstance(value, str):
        return None

    if EMAIL_PATTERN.search(value):
        return "[EMAIL_REDACTED]"
    return None


class EventSanitizer:
    """Sanitizes event data using pluggable PII detectors."""

    def __init__(self, detectors: list[PIIDetector] | None = None, max_depth: int = 10) -> None:
        """Initialize the sanitizer with detectors and max depth."""
        self.detectors = detectors or []
        self.max_depth = max_depth

    def _apply_detectors(self, value: Any, key: str) -> Any:  # noqa: ANN401
        """Apply all detectors to a value."""
        for detector in self.detectors:
            result = detector(value, key)
            if result is not None:
                return result
        return value

    def _convert(
        self,
        obj: Any,  # noqa: ANN401
        key: str = "",
        traversal_stack: set[int] | None = None,
    ) -> Any:  # noqa: ANN401
        """Recursively convert and sanitize an object."""
        if traversal_stack is None:
            traversal_stack = set()

        if len(traversal_stack) >= self.max_depth:
            return "[MAX_DEPTH]"

        # Only track objects that can actually contain references.
        # Primitives (str, int, float, bool, None) are immutable and safe to reuse.
        if not isinstance(obj, (str, int, float, bool, type(None))):
            obj_id = id(obj)
            # Check if this object is already in the current traversal stack (true circular reference)
            if obj_id in traversal_stack:
                return "[CIRCULAR]"

            # Add to traversal stack before processing
            traversal_stack.add(obj_id)

            try:
                # Process the object
                return self._convert_by_type(obj, key, traversal_stack)
            finally:
                # Remove from traversal stack after processing
                traversal_stack.remove(obj_id)
        else:
            # Primitives don't need stack tracking
            return self._convert_by_type(obj, key, traversal_stack)

    def _convert_by_type(
        self,
        obj: Any,  # noqa: ANN401
        key: str,
        traversal_stack: set[int],
    ) -> Any:  # noqa: ANN401
        """Convert object based on its type."""
        # primitives
        if isinstance(obj, (str, int, float, bool)) or obj is None:
            return self._apply_detectors(obj, key)

        # Pydantic models
        if isinstance(obj, BaseModel):
            return self._convert(obj.model_dump(), key, traversal_stack)

        # mappings
        if isinstance(obj, Mapping):
            return {str(k): self._convert(v, str(k), traversal_stack) for k, v in obj.items()}

        # sequences (excluding string-like types)
        if isinstance(obj, Sequence) and not isinstance(obj, (str, bytes, bytearray)):
            return [self._convert(item, key, traversal_stack) for item in obj]

        # bytes and bytearray
        if isinstance(obj, (bytes, bytearray)):
            return obj.decode("utf-8", errors="replace")

        # fallback for all other types
        return str(obj)

    def sanitize(self, data: dict[str, Any]) -> dict[str, Any]:
        """Sanitize data using the configured detectors."""
        # Since we start with a dict and the conversion preserves dict structure we can safely cast the result
        return cast("dict[str, Any]", self._convert(data))
