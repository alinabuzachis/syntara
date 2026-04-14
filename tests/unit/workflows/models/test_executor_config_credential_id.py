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

    def test_credential_id_serializes_as_camel_case(self) -> None:
        """CredentialId should serialize with camelCase alias."""
        config = APIExecutorConfig(
            method=HTTPMethod.GET,
            url="https://example.com",
            credentialId="550e8400-e29b-41d4-a716-446655440000",
        )
        dumped = config.model_dump(by_alias=True)
        assert "credentialId" in dumped
        assert dumped["credentialId"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_credential_id_deserializes_from_camel_case(self) -> None:
        """CredentialId should deserialize from camelCase JSON."""
        config = APIExecutorConfig.model_validate(
            {
                "method": "GET",
                "url": "https://example.com",
                "credentialId": "550e8400-e29b-41d4-a716-446655440000",
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
        """Both credentialId and authentication can be set simultaneously."""
        config = APIExecutorConfig(
            method=HTTPMethod.GET,
            url="https://example.com",
            credentialId="550e8400-e29b-41d4-a716-446655440000",
            authentication=Authentication(
                type=AuthenticationType.BEARER,
                credentials="${secrets.my_token}",
            ),
        )
        assert config.credential_id is not None
        assert config.authentication is not None


class TestAgenticExecutorConfigCredentialId:
    """Verify credentialId on AgenticExecutorConfig."""

    def test_credential_id_serializes(self) -> None:
        config = AgenticExecutorConfig(
            prompt="Hello",
            credentialId="550e8400-e29b-41d4-a716-446655440000",
        )
        dumped = config.model_dump(by_alias=True)
        assert dumped["credentialId"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_backward_compat_without_credential_id(self) -> None:
        config = AgenticExecutorConfig.model_validate({"prompt": "Hello"})
        assert config.credential_id is None


class TestAAPJobTemplateExecutorConfigCredentialId:
    """Verify credentialId on AAPJobTemplateExecutorConfig."""

    def test_credential_id_serializes(self) -> None:
        config = AAPJobTemplateExecutorConfig(
            jobTemplateId=1,
            credentialId="550e8400-e29b-41d4-a716-446655440000",
        )
        dumped = config.model_dump(by_alias=True)
        assert dumped["credentialId"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_credential_id_coexists_with_legacy_credentials(self) -> None:
        """CredentialId (Nexus) and credentials (AAP legacy IDs) can coexist."""
        config = AAPJobTemplateExecutorConfig(
            jobTemplateId=1,
            credentialId="550e8400-e29b-41d4-a716-446655440000",
            credentials=[42, 43],
        )
        assert config.credential_id is not None
        assert config.credentials == [42, 43]

    def test_backward_compat_without_credential_id(self) -> None:
        config = AAPJobTemplateExecutorConfig.model_validate({"jobTemplateId": 1})
        assert config.credential_id is None
