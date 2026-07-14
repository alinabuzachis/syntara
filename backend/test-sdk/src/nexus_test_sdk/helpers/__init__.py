"""Shared helpers for Nexus E2E test fixtures."""

from __future__ import annotations

import secrets
import string
from uuid import uuid4

from nexus_api_client.models.workflow_definition import WorkflowDefinition

_MIN_TEST_PASSWORD_LENGTH = 14
_SAFE_TEST_PASSWORD_PUNCTUATION = "!@#$%^&*(),.?-_"  # noqa: S105

MINIMAL_WORKFLOW_DEFINITION: WorkflowDefinition = WorkflowDefinition.from_dict(
    {
        "schema_version": "2.0.0",
        "name": "e2e-rbac-minimal",
        "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
        "nodes": [],
        "edges": [],
    }
)


def unique_name(base: str) -> str:
    """Generate a unique resource name to avoid conflicts across E2E test runs."""
    return f"{base}-{uuid4().hex[:8]}"


def generate_test_password() -> str:
    """Return a random password that satisfies server complexity rules for E2E tests."""
    password_chars = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice(_SAFE_TEST_PASSWORD_PUNCTUATION),
    ]
    all_chars = string.ascii_letters + string.digits + _SAFE_TEST_PASSWORD_PUNCTUATION
    extra_count = _MIN_TEST_PASSWORD_LENGTH - len(password_chars)
    password_chars.extend(secrets.choice(all_chars) for _ in range(extra_count))
    password_list = list(password_chars)
    secrets.SystemRandom().shuffle(password_list)
    return "".join(password_list)
