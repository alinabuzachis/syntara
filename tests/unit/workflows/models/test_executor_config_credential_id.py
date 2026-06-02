"""Tests for credentialId field on executor configs (T055)."""

from http import HTTPMethod

from nexus.workflows.workflow_engine.models.workflow_definition import (
    AAPJobTemplateExecutorConfig,
    AgenticExecutorConfig,
    APIExecutorConfig,
    Authentication,
    AuthenticationType,
)


class TestAPIExecutorConfigCredentialId:
    """Verify credentialId on APIExecutorConfig."""

    def test_credential_id_serializes_as_snake_case(self) -> None:
        """CredentialId should serialize with snake_case."""
        config = APIExecutorConfig(
            method=HTTPMethod.GET,
            url="https://example.com",
            credential_id="550e8400-e29b-41d4-a716-446655440000",
        )
        dumped = config.model_dump(by_alias=True)
        assert "credential_id" in dumped
        assert dumped["credential_id"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_credential_id_deserializes_from_snake_case(self) -> None:
        """CredentialId should deserialize from snake_case JSON."""
        config = APIExecutorConfig.model_validate(
            {
                "method": "GET",
                "url": "https://example.com",
                "credential_id": "550e8400-e29b-41d4-a716-446655440000",
            }
        )
        assert config.credential_id == "550e8400-e29b-41d4-a716-446655440000"

    def test_backward_compat_without_credential_id(self) -> None:
        """Configs without credentialId should still parse."""
        config = APIExecutorConfig.model_validate(
            {
                "method": "GET",
                "url": "https://example.com",
            }
        )
        assert config.credential_id is None

    def test_credential_id_and_authentication_coexist(self) -> None:
        """Both credential_id and authentication can be set simultaneously."""
        config = APIExecutorConfig(
            method=HTTPMethod.GET,
            url="https://example.com",
            credential_id="550e8400-e29b-41d4-a716-446655440000",
            authentication=Authentication(
                type=AuthenticationType.BEARER,
                credentials="${secrets.my_token}",
            ),
        )
        assert config.credential_id is not None
        assert config.authentication is not None


class TestAgenticExecutorConfigCredentialId:
    """Verify credential_id on AgenticExecutorConfig."""

    def test_credential_id_serializes(self) -> None:
        config = AgenticExecutorConfig(
            prompt="Hello",
            credential_id="550e8400-e29b-41d4-a716-446655440000",
        )
        dumped = config.model_dump(by_alias=True)
        assert dumped["credential_id"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_backward_compat_without_credential_id(self) -> None:
        config = AgenticExecutorConfig.model_validate({"prompt": "Hello"})
        assert config.credential_id is None


class TestAAPJobTemplateExecutorConfigCredentialId:
    """Verify credential_id on AAPJobTemplateExecutorConfig."""

    def test_credential_id_serializes(self) -> None:
        config = AAPJobTemplateExecutorConfig(
            job_template_id=1,
            credential_id="550e8400-e29b-41d4-a716-446655440000",
        )
        dumped = config.model_dump(by_alias=True)
        assert dumped["credential_id"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_credential_id_coexists_with_job_credentials(self) -> None:
        """credential_id (Nexus) and job_credentials (AAP IDs) can coexist."""
        config = AAPJobTemplateExecutorConfig(
            job_template_id=1,
            credential_id="550e8400-e29b-41d4-a716-446655440000",
            job_credentials=[42, 43],
        )
        assert config.credential_id is not None
        assert config.job_credentials == [42, 43]

    def test_job_credentials_field_works(self) -> None:
        """The job_credentials field can be set directly."""
        config = AAPJobTemplateExecutorConfig.model_validate({"job_template_id": 1, "job_credentials": [42, 43]})
        assert config.job_credentials == [42, 43]

    def test_backward_compat_without_credential_id(self) -> None:
        config = AAPJobTemplateExecutorConfig.model_validate({"job_template_id": 1})
        assert config.credential_id is None
