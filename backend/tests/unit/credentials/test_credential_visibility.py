"""Unit tests for _CredentialVisibility — covers the cert-authenticated fast path."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from nexus.authz.engine import VisibilityResult
from nexus.credentials.router import _CredentialVisibility


class TestCredentialVisibilityCertAuth:  # noqa: D101
    @pytest.mark.asyncio
    async def test_cert_authenticated_returns_unrestricted(self) -> None:
        """S2S cert-authenticated requests bypass OPA entirely."""
        visibility = _CredentialVisibility()

        request = MagicMock()
        request.state.is_cert_authenticated = True
        request.query_params.get.return_value = None

        current_user = MagicMock()
        current_user.id = uuid4()

        result = await visibility(
            request=request,
            current_user=current_user,
            db=AsyncMock(),
            evaluator=MagicMock(),
        )

        assert result.unrestricted is True
        assert isinstance(result, VisibilityResult)
