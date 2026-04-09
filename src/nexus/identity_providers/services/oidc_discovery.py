"""OIDC discovery service for testing identity provider connections."""

from pydantic import BaseModel

from nexus.auth.services.oidc_service import OIDCError, OIDCService


class OIDCTestResult(BaseModel):
    """Result of an OIDC connection test."""

    success: bool
    message: str
    metadata: dict[str, str] | None = None


async def test_oidc_connection(issuer_url: str) -> OIDCTestResult:
    """Test OIDC connection by fetching the well-known configuration.

    Delegates to OIDCService.fetch_discovery_config to avoid duplicating
    the discovery fetch/validation logic.

    Args:
        issuer_url: The OIDC issuer URL to test

    Returns:
        OIDCTestResult with success status, message, and discovered metadata

    """
    try:
        oidc_service = OIDCService()
        data = await oidc_service.fetch_discovery_config(issuer_url)

        return OIDCTestResult(
            success=True,
            message="OIDC discovery successful",
            metadata={
                "authorization_endpoint": data["authorization_endpoint"],
                "token_endpoint": data["token_endpoint"],
                "issuer": data["issuer"],
                "jwks_uri": data["jwks_uri"],
            },
        )

    except OIDCError as e:
        return OIDCTestResult(
            success=False,
            message=str(e),
        )
    except Exception as e:  # noqa: BLE001
        return OIDCTestResult(
            success=False,
            message=f"Unexpected error: {e}",
        )
