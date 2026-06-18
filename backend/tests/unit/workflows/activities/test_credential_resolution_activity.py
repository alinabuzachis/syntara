"""Tests for credential resolution Temporal activity (T059)."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from temporalio.exceptions import ApplicationError

ACTIVITY_ID = "api-node-1"
CREDENTIAL_ID = str(uuid4())
PROJECT_A_ID = str(uuid4())
PROJECT_B_ID = str(uuid4())


@pytest.fixture
def mock_credential() -> MagicMock:
    """Create a mock credential."""
    cred = MagicMock()
    cred.id = CREDENTIAL_ID
    cred.name = "Test Credential"
    cred.enabled = True
    cred.secret_id = uuid4()
    cred.credential_type_id = uuid4()
    cred.project_id = PROJECT_A_ID
    return cred


@pytest.fixture
def mock_credential_type() -> MagicMock:
    """Create a mock credential type."""
    ct = MagicMock()
    ct.name = "HTTP Bearer Token"
    ct.injectors = {
        "extra_vars": {"auth_type": "bearer", "bearer_token": "{{token}}"},
        "env": {},
        "file": {},
    }
    return ct


class TestResolveWorkflowCredentials:
    """Tests for resolve_workflow_credentials activity."""

    @pytest.mark.asyncio
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity._session_factory")
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity.create_secret_service")
    async def test_happy_path_resolves_credential(
        self,
        mock_create_ss: MagicMock,
        mock_session_local: MagicMock,
        mock_credential: MagicMock,
        mock_credential_type: MagicMock,
    ) -> None:
        """Test successful credential resolution with correct extra_vars."""
        from nexus.workflows.workflow_engine.activities.credential_resolution_activity import (
            resolve_workflow_credentials,
        )

        mock_session = AsyncMock()
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        # Mock credential query
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_credential
        mock_session.exec = AsyncMock(return_value=mock_result)

        # Mock credential type fetch
        mock_session.get = AsyncMock(return_value=mock_credential_type)

        # Mock SecretService via create_secret_service
        mock_ss = MagicMock()
        mock_ss.retrieve_secret = AsyncMock(return_value={"token": "my-secret-token"})
        mock_create_ss.return_value = mock_ss

        result = await resolve_workflow_credentials({ACTIVITY_ID: CREDENTIAL_ID})

        assert ACTIVITY_ID in result
        assert result[ACTIVITY_ID]["credential_id"] == CREDENTIAL_ID
        assert result[ACTIVITY_ID]["credential_type_name"] == "HTTP Bearer Token"
        assert result[ACTIVITY_ID]["extra_vars"]["bearer_token"] == "my-secret-token"  # noqa: S105

    @pytest.mark.asyncio
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity._session_factory")
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity.create_secret_service")
    async def test_disabled_credential_raises_non_retryable(
        self,
        mock_create_ss: MagicMock,
        mock_session_local: MagicMock,
        mock_credential: MagicMock,
    ) -> None:
        """Test disabled credential raises non-retryable ApplicationError."""
        from nexus.workflows.workflow_engine.activities.credential_resolution_activity import (
            resolve_workflow_credentials,
        )

        mock_credential.enabled = False

        mock_session = AsyncMock()
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_credential
        mock_session.exec = AsyncMock(return_value=mock_result)

        with pytest.raises(ApplicationError, match="disabled"):
            await resolve_workflow_credentials({ACTIVITY_ID: CREDENTIAL_ID})

    @pytest.mark.asyncio
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity._session_factory")
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity.create_secret_service")
    async def test_missing_credential_raises_non_retryable(
        self,
        mock_create_ss: MagicMock,
        mock_session_local: MagicMock,
    ) -> None:
        """Test missing credential raises non-retryable ApplicationError."""
        from nexus.workflows.workflow_engine.activities.credential_resolution_activity import (
            resolve_workflow_credentials,
        )

        mock_session = AsyncMock()
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_session.exec = AsyncMock(return_value=mock_result)

        with pytest.raises(ApplicationError, match="not found"):
            await resolve_workflow_credentials({ACTIVITY_ID: CREDENTIAL_ID})

    @pytest.mark.asyncio
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity._session_factory")
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity.create_secret_service")
    async def test_no_secret_id_raises_non_retryable(
        self,
        mock_create_ss: MagicMock,
        mock_session_local: MagicMock,
        mock_credential: MagicMock,
    ) -> None:
        """Test credential with no secret_id raises non-retryable error."""
        from nexus.workflows.workflow_engine.activities.credential_resolution_activity import (
            resolve_workflow_credentials,
        )

        mock_credential.secret_id = None

        mock_session = AsyncMock()
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_credential
        mock_session.exec = AsyncMock(return_value=mock_result)

        with pytest.raises(ApplicationError, match="no stored secret"):
            await resolve_workflow_credentials({ACTIVITY_ID: CREDENTIAL_ID})

    @pytest.mark.asyncio
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity._session_factory")
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity.create_secret_service")
    async def test_decryption_failure_raises_non_retryable(
        self,
        mock_create_ss: MagicMock,
        mock_session_local: MagicMock,
        mock_credential: MagicMock,
    ) -> None:
        """Test decryption failure raises non-retryable ApplicationError."""
        from nexus.core.lib.encryption import EncryptionError
        from nexus.workflows.workflow_engine.activities.credential_resolution_activity import (
            resolve_workflow_credentials,
        )

        mock_session = AsyncMock()
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_credential
        mock_session.exec = AsyncMock(return_value=mock_result)

        mock_ss = MagicMock()
        mock_ss.retrieve_secret = AsyncMock(side_effect=EncryptionError("decryption failed"))
        mock_create_ss.return_value = mock_ss

        with pytest.raises(ApplicationError, match="Failed to decrypt"):
            await resolve_workflow_credentials({ACTIVITY_ID: CREDENTIAL_ID})


class TestCrossProjectCredentialResolution:
    """AAP-79159: credential resolution rejects cross-project references."""

    @pytest.mark.asyncio
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity._session_factory")
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity.create_secret_service")
    async def test_cross_project_credential_rejected_at_runtime(
        self,
        mock_create_ss: MagicMock,
        mock_session_local: MagicMock,
        mock_credential: MagicMock,
    ) -> None:
        """Credential from project A must be rejected when workflow belongs to project B."""
        from nexus.workflows.workflow_engine.activities.credential_resolution_activity import (
            resolve_workflow_credentials,
        )

        mock_session = AsyncMock()
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_credential
        mock_session.exec = AsyncMock(return_value=mock_result)

        with pytest.raises(ApplicationError, match="does not belong to workflow project"):
            await resolve_workflow_credentials(
                {ACTIVITY_ID: CREDENTIAL_ID},
                project_id=PROJECT_B_ID,
            )

    @pytest.mark.asyncio
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity._session_factory")
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity.create_secret_service")
    async def test_same_project_credential_allowed(
        self,
        mock_create_ss: MagicMock,
        mock_session_local: MagicMock,
        mock_credential: MagicMock,
        mock_credential_type: MagicMock,
    ) -> None:
        """Credential from the same project must resolve successfully."""
        from nexus.workflows.workflow_engine.activities.credential_resolution_activity import (
            resolve_workflow_credentials,
        )

        mock_session = AsyncMock()
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_credential
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.get = AsyncMock(return_value=mock_credential_type)

        mock_ss = MagicMock()
        mock_ss.retrieve_secret = AsyncMock(return_value={"token": "secret"})
        mock_create_ss.return_value = mock_ss

        result = await resolve_workflow_credentials(
            {ACTIVITY_ID: CREDENTIAL_ID},
            project_id=PROJECT_A_ID,
        )
        assert ACTIVITY_ID in result
        assert result[ACTIVITY_ID]["credential_id"] == CREDENTIAL_ID

    @pytest.mark.asyncio
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity._session_factory")
    @patch("nexus.workflows.workflow_engine.activities.credential_resolution_activity.create_secret_service")
    async def test_no_project_id_allows_resolution_for_backward_compat(
        self,
        mock_create_ss: MagicMock,
        mock_session_local: MagicMock,
        mock_credential: MagicMock,
        mock_credential_type: MagicMock,
    ) -> None:
        """When project_id is None (legacy/in-flight), credential resolves without project check."""
        from nexus.workflows.workflow_engine.activities.credential_resolution_activity import (
            resolve_workflow_credentials,
        )

        mock_session = AsyncMock()
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_credential
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.get = AsyncMock(return_value=mock_credential_type)

        mock_ss = MagicMock()
        mock_ss.retrieve_secret = AsyncMock(return_value={"token": "secret"})
        mock_create_ss.return_value = mock_ss

        result = await resolve_workflow_credentials({ACTIVITY_ID: CREDENTIAL_ID})
        assert ACTIVITY_ID in result
