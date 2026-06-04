"""Integration tests for audit export API endpoints."""

from collections.abc import Awaitable, Callable, Generator
from contextlib import AbstractContextManager
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession
from temporalio.service import RPCError, RPCStatusCode

from nexus.core.models import User
from tests.helpers.error_data import assert_error_data
from tests.integration.api.conftest import make_auditor

EXPORTS_URL = "/api/v1/audit/exports"


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture(autouse=True)
def disable_audit_emission(monkeypatch: pytest.MonkeyPatch) -> None:
    """Silence audit event emission to avoid polluting test assertions."""
    monkeypatch.setattr("nexus.audit.emitter._do_emit_audit_event", lambda _event: None)


@pytest.fixture
def mock_temporal_handle() -> AsyncMock:
    """Create a configurable mock Temporal workflow handle."""
    handle = AsyncMock()
    status_mock = MagicMock()
    status_mock.name = "RUNNING"
    desc = MagicMock()
    desc.status = status_mock
    handle.describe.return_value = desc
    handle.result.return_value = {"status": "completed", "row_count": 0}
    return handle


@pytest.fixture(autouse=True)
def mock_temporal_client(mock_temporal_handle: AsyncMock) -> Generator[AsyncMock, None, None]:
    """Patch _get_temporal_client to return a mock Temporal client."""
    client = AsyncMock()
    client.start_workflow = AsyncMock(return_value=None)
    client.get_workflow_handle = MagicMock(return_value=mock_temporal_handle)
    with patch("nexus.audit.services.audit_event_service._get_temporal_client", new=AsyncMock(return_value=client)):
        yield client


# ============================================================================
# POST /api/v1/audit/exports
# ============================================================================


class TestStartAuditExport:
    """Tests for the start_audit_export endpoint."""

    @pytest.mark.asyncio
    async def test_start_export_returns_202(self, auth_client_as_admin: AsyncClient) -> None:
        response = await auth_client_as_admin.post(EXPORTS_URL, json={})

        assert response.status_code == 202
        data = response.json()
        assert "id" in data
        assert data["status"] == "pending"

    @pytest.mark.asyncio
    async def test_start_export_with_filters(self, auth_client_as_admin: AsyncClient) -> None:
        response = await auth_client_as_admin.post(
            EXPORTS_URL,
            json={
                "event_category": "user_action",
                "created_at_gte": "2025-01-01T00:00:00Z",
                "export_format": "csv",
            },
        )

        assert response.status_code == 202
        assert response.json()["status"] == "pending"

    @pytest.mark.asyncio
    async def test_start_export_calls_temporal(
        self,
        auth_client_as_admin: AsyncClient,
        mock_temporal_client: AsyncMock,
    ) -> None:
        await auth_client_as_admin.post(EXPORTS_URL, json={})

        mock_temporal_client.start_workflow.assert_awaited_once()
        call_kwargs = mock_temporal_client.start_workflow.call_args
        assert call_kwargs.kwargs["id"].startswith("audit-export-")

    @pytest.mark.asyncio
    async def test_start_export_unauthenticated_401(self, base_client: AsyncClient) -> None:
        response = await base_client.post(EXPORTS_URL, json={})

        assert response.status_code == 401
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/unauthorized",
            title="Unauthorized",
            detail="Authentication required",
            code="AUTHENTICATION_REQUIRED",
            retryable=False,
        )

    @pytest.mark.asyncio
    async def test_start_export_forbidden_403(
        self,
        base_client: AsyncClient,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """Authenticated user without audit:read permission is rejected with 403."""
        unprivileged = await user_factory(username=f"no-audit-{uuid4()}", email=f"no-audit-{uuid4()}@test.com")
        auth_as(unprivileged)
        response = await base_client.post(EXPORTS_URL, json={})

        assert response.status_code == 403
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/forbidden",
            title="Authorization Denied",
            detail="Not authorized to perform read on audit",
            code="AUTHORIZATION_DENIED",
            retryable=False,
        )

    @pytest.mark.asyncio
    async def test_start_export_allowed_for_auditor(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        test_user: User,
    ) -> None:
        await make_auditor(test_db_session, test_user)

        response = await auth_client.post(EXPORTS_URL, json={})

        assert response.status_code == 202

    @pytest.mark.asyncio
    async def test_start_export_invalid_enum_422(self, auth_client_as_admin: AsyncClient) -> None:
        response = await auth_client_as_admin.post(
            EXPORTS_URL,
            json={"event_category": "not_valid"},
        )

        assert response.status_code == 422
        # Note: Validation error details are dynamic based on Pydantic error messages
        data = response.json()
        assert "detail" in data


# ============================================================================
# Status polling
# ============================================================================


class TestGetAuditExportStatus:
    """Tests for the get_audit_export_status endpoint."""

    @pytest.mark.asyncio
    async def test_status_running(
        self,
        auth_client_as_admin: AsyncClient,
        mock_temporal_handle: AsyncMock,
    ) -> None:
        mock_temporal_handle.describe.return_value.status.name = "RUNNING"

        response = await auth_client_as_admin.get(f"{EXPORTS_URL}/{uuid4()}")

        assert response.status_code == 200
        assert response.json()["status"] == "running"

    @pytest.mark.asyncio
    async def test_status_completed(
        self,
        auth_client_as_admin: AsyncClient,
        mock_temporal_handle: AsyncMock,
    ) -> None:
        export_id = uuid4()
        mock_temporal_handle.describe.return_value.status.name = "COMPLETED"
        mock_temporal_handle.result.return_value = {"status": "completed", "row_count": 42}

        response = await auth_client_as_admin.get(f"{EXPORTS_URL}/{export_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["row_count"] == 42
        assert data["file_name"] == f"audit-export-{export_id}.csv"

    @pytest.mark.asyncio
    async def test_status_completed_but_activity_failed(
        self,
        auth_client_as_admin: AsyncClient,
        mock_temporal_handle: AsyncMock,
    ) -> None:
        mock_temporal_handle.describe.return_value.status.name = "COMPLETED"
        mock_temporal_handle.result.return_value = {"status": "failed", "error": "DB connection lost"}

        response = await auth_client_as_admin.get(f"{EXPORTS_URL}/{uuid4()}")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "failed"
        assert data["error"] == "DB connection lost"

    @pytest.mark.asyncio
    async def test_status_workflow_failed(
        self,
        auth_client_as_admin: AsyncClient,
        mock_temporal_handle: AsyncMock,
    ) -> None:
        mock_temporal_handle.describe.return_value.status.name = "FAILED"

        response = await auth_client_as_admin.get(f"{EXPORTS_URL}/{uuid4()}")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "failed"
        assert data["error"] == "Export workflow failed"

    @pytest.mark.asyncio
    async def test_status_not_found_returns_404(
        self,
        auth_client_as_admin: AsyncClient,
        mock_temporal_handle: AsyncMock,
    ) -> None:
        """F-1: RPCError(NOT_FOUND) from Temporal must surface as HTTP 404, not 500."""
        export_id = uuid4()
        mock_temporal_handle.describe.side_effect = RPCError(
            "workflow not found",
            RPCStatusCode.NOT_FOUND,
            b"",
        )

        response = await auth_client_as_admin.get(f"{EXPORTS_URL}/{export_id}")

        assert response.status_code == 404
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/resource-not-found",
            title="Export Not Found",
            detail=f"Audit export {export_id} not found.",
            code="EXPORT_NOT_FOUND",
            retryable=False,
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status_name", ["TIMED_OUT", "CANCELLED", "TERMINATED"])
    async def test_status_terminal_failure_maps_to_failed(
        self,
        status_name: str,
        auth_client_as_admin: AsyncClient,
        mock_temporal_handle: AsyncMock,
    ) -> None:
        """F-2: Terminal Temporal statuses must map to ExportStatus.FAILED, not RUNNING."""
        mock_temporal_handle.describe.return_value.status.name = status_name

        response = await auth_client_as_admin.get(f"{EXPORTS_URL}/{uuid4()}")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "failed"
        assert status_name.lower() in (data.get("error") or "")

    @pytest.mark.asyncio
    async def test_status_unauthenticated_401(self, base_client: AsyncClient) -> None:
        response = await base_client.get(f"{EXPORTS_URL}/test-123")

        assert response.status_code == 401
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/unauthorized",
            title="Unauthorized",
            detail="Authentication required",
            code="AUTHENTICATION_REQUIRED",
            retryable=False,
        )

    @pytest.mark.asyncio
    async def test_status_forbidden_403(
        self,
        base_client: AsyncClient,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """Authenticated user without audit:read permission is rejected with 403."""
        unprivileged = await user_factory(username=f"no-audit-{uuid4()}", email=f"no-audit-{uuid4()}@test.com")
        auth_as(unprivileged)
        response = await base_client.get(f"{EXPORTS_URL}/{uuid4()}")

        assert response.status_code == 403
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/forbidden",
            title="Authorization Denied",
            detail="Not authorized to perform read on audit",
            code="AUTHORIZATION_DENIED",
            retryable=False,
        )


# ============================================================================
# File download
# ============================================================================


class TestDownloadAuditExport:
    """Tests for the download_audit_export endpoint."""

    @pytest.mark.asyncio
    async def test_download_not_found_404(
        self,
        auth_client_as_admin: AsyncClient,
        mock_temporal_handle: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
        tmp_path: Path,
    ) -> None:
        export_id = uuid4()
        mock_temporal_handle.describe.side_effect = RPCError(
            "workflow not found",
            RPCStatusCode.NOT_FOUND,
            b"",
        )
        with override_settings(audit_export_dir=str(tmp_path)):
            response = await auth_client_as_admin.get(f"{EXPORTS_URL}/{export_id}/download")

        assert response.status_code == 404
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/resource-not-found",
            title="Export Not Found",
            detail=f"Audit export {export_id} not found.",
            code="EXPORT_NOT_FOUND",
            retryable=False,
        )

    @pytest.mark.asyncio
    async def test_download_in_progress_returns_409(
        self,
        auth_client_as_admin: AsyncClient,
        mock_temporal_handle: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
        tmp_path: Path,
    ) -> None:
        """Download returns 409 when the export is still running."""
        export_id = uuid4()
        mock_temporal_handle.describe.return_value.status.name = "RUNNING"
        # No CSV file on disk — the atomic rename has not happened yet.
        with override_settings(audit_export_dir=str(tmp_path)):
            response = await auth_client_as_admin.get(f"{EXPORTS_URL}/{export_id}/download")

        assert response.status_code == 409
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/resource-conflict",
            title="Export Not Ready",
            detail=f"Audit export {export_id} is still in progress. Poll the status endpoint and retry when complete.",
            code="EXPORT_NOT_READY",
            retryable=True,
        )

    @pytest.mark.asyncio
    async def test_download_existing_file(
        self,
        auth_client_as_admin: AsyncClient,
        override_settings: Callable[..., AbstractContextManager[object]],
        tmp_path: Path,
    ) -> None:
        export_id = uuid4()
        csv_file = tmp_path / f"audit-export-{export_id}.csv"
        csv_file.write_text("id,created_at\n1,2025-01-01\n")

        with override_settings(audit_export_dir=str(tmp_path)):
            response = await auth_client_as_admin.get(f"{EXPORTS_URL}/{export_id}/download")

        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_download_unauthenticated_401(self, base_client: AsyncClient) -> None:
        response = await base_client.get(f"{EXPORTS_URL}/test-123/download")

        assert response.status_code == 401
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/unauthorized",
            title="Unauthorized",
            detail="Authentication required",
            code="AUTHENTICATION_REQUIRED",
            retryable=False,
        )

    @pytest.mark.asyncio
    async def test_download_forbidden_403(
        self,
        base_client: AsyncClient,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """Authenticated user without audit:read permission is rejected with 403."""
        unprivileged = await user_factory(username=f"no-audit-{uuid4()}", email=f"no-audit-{uuid4()}@test.com")
        auth_as(unprivileged)
        response = await base_client.get(f"{EXPORTS_URL}/{uuid4()}/download")

        assert response.status_code == 403
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/forbidden",
            title="Authorization Denied",
            detail="Not authorized to perform read on audit",
            code="AUTHORIZATION_DENIED",
            retryable=False,
        )

    @pytest.mark.asyncio
    async def test_download_allowed_for_auditor(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        test_user: User,
        override_settings: Callable[..., AbstractContextManager[object]],
        tmp_path: Path,
    ) -> None:
        await make_auditor(test_db_session, test_user)

        export_id = uuid4()
        csv_file = tmp_path / f"audit-export-{export_id}.csv"
        csv_file.write_text("id,created_at\n1,2025-01-01\n")

        with override_settings(audit_export_dir=str(tmp_path)):
            response = await auth_client.get(f"{EXPORTS_URL}/{export_id}/download")

        assert response.status_code == 200
