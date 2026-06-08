"""Tests for Agentic activity credential injection (T069).

Verifies that credential_id (not the decrypted key) is passed to
Agent Orchestrator via metadata for deferred resolution.
"""

from typing import Any

from nexus.workflows.workflow_engine.activities.agentic_activity import _inject_llm_credential_metadata


class TestAgenticCredentialMetadata:
    """Test LLM credential injection into agent metadata."""

    def test_credential_id_injected_not_api_key(self) -> None:
        """credential_id is injected; llm_api_key is NOT (security: no plaintext in context_data)."""
        metadata: dict[str, Any] = {"activity_name": "test"}
        input_data: dict[str, Any] = {
            "_resolved_credentials": {
                "credential_id": "cred-uuid-123",
                "extra_vars": {
                    "auth_type": "api_key",
                    "llm_provider": "anthropic",
                    "llm_api_key": "sk-ant-secret",
                    "llm_base_url": "https://api.anthropic.com",
                },
            },
        }

        _inject_llm_credential_metadata(metadata, input_data)

        assert metadata["credential_id"] == "cred-uuid-123"
        assert "llm_api_key" not in metadata  # security: never stored in context_data
        assert metadata["llm_provider"] == "anthropic"
        assert metadata["llm_base_url"] == "https://api.anthropic.com"
        assert metadata["activity_name"] == "test"  # preserved

    def test_no_credentials_no_metadata(self) -> None:
        """Without resolved credentials, metadata is unchanged."""
        metadata: dict[str, Any] = {"activity_name": "test"}

        _inject_llm_credential_metadata(metadata, {})

        assert "credential_id" not in metadata
        assert "llm_api_key" not in metadata
        assert "llm_provider" not in metadata
        assert metadata["activity_name"] == "test"

    def test_partial_credentials_no_credential_id(self) -> None:
        """Without credential_id, only non-secret fields are added."""
        metadata: dict[str, Any] = {}
        input_data: dict[str, Any] = {
            "_resolved_credentials": {
                "extra_vars": {
                    "llm_provider": "openrouter",
                },
            },
        }

        _inject_llm_credential_metadata(metadata, input_data)

        assert "credential_id" not in metadata
        assert "llm_api_key" not in metadata
        assert metadata["llm_provider"] == "openrouter"

    def test_non_secret_fields_only(self) -> None:
        """Only non-secret fields (provider, base_url) are passed directly."""
        metadata: dict[str, Any] = {}
        input_data: dict[str, Any] = {
            "_resolved_credentials": {
                "credential_id": "cred-456",
                "extra_vars": {
                    "llm_api_key": "sk-secret-key",
                    "llm_provider": "openai",
                    "llm_base_url": "https://api.openai.com/v1",
                },
            },
        }

        _inject_llm_credential_metadata(metadata, input_data)

        # credential_id passed for deferred resolution
        assert metadata["credential_id"] == "cred-456"
        # non-secret fields passed directly
        assert metadata["llm_provider"] == "openai"
        assert metadata["llm_base_url"] == "https://api.openai.com/v1"
        # secret field NOT passed
        assert "llm_api_key" not in metadata
