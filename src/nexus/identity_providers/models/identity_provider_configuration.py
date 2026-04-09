"""Identity provider configuration models.

This module contains configuration classes for different identity provider types.
Each configuration class defines the required and optional parameters for
connecting to and interacting with a specific provider type.
"""

from typing import Annotated, ClassVar, Literal

from pydantic import ConfigDict, Field
from sqlmodel import SQLModel


class OIDCConfiguration(SQLModel):
    """Configuration for OIDC (OpenID Connect) providers."""

    provider_type: Literal["oidc"] = "oidc"

    auto_discovery: bool = Field(default=True, description="Use OIDC auto-discovery via .well-known endpoint")

    issuer_url: str = Field(description="OIDC issuer URL (e.g. https://accounts.google.com)")

    client_id: str = Field(description="OAuth 2.0 client ID")

    client_secret: str = Field(description="OAuth 2.0 client secret")

    redirect_uri: str = Field(description="OAuth 2.0 redirect URI")

    scopes: str = Field(default="openid profile email", description="Space-separated list of OAuth 2.0 scopes")

    # Manual endpoint fields (used when auto_discovery is disabled)
    authorization_endpoint: str | None = Field(default=None, description="Authorization endpoint URL")
    token_endpoint: str | None = Field(default=None, description="Token endpoint URL")
    jwks_uri: str | None = Field(default=None, description="JWKS URI for token verification")
    userinfo_endpoint: str | None = Field(default=None, description="Userinfo endpoint URL (optional)")

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",
    )  # type: ignore[assignment]


class OIDCConfigurationResponse(SQLModel):
    """Response schema for OIDC configuration (excludes client_secret)."""

    provider_type: Literal["oidc"] = "oidc"

    auto_discovery: bool = Field(default=True, description="Use OIDC auto-discovery via .well-known endpoint")

    issuer_url: str = Field(description="OIDC issuer URL (e.g. https://accounts.google.com)")

    client_id: str = Field(description="OAuth 2.0 client ID")

    redirect_uri: str = Field(description="OAuth 2.0 redirect URI")

    scopes: str = Field(default="openid profile email", description="Space-separated list of OAuth 2.0 scopes")

    authorization_endpoint: str | None = Field(default=None, description="Authorization endpoint URL")
    token_endpoint: str | None = Field(default=None, description="Token endpoint URL")
    jwks_uri: str | None = Field(default=None, description="JWKS URI for token verification")
    userinfo_endpoint: str | None = Field(default=None, description="Userinfo endpoint URL (optional)")

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",
    )  # type: ignore[assignment]


# Discriminated union for all identity provider configurations
# When adding new provider types (LDAP, SAML), add them to this union
IdentityProviderConfigurationTypes = OIDCConfiguration
IdentityProviderConfiguration = Annotated[
    IdentityProviderConfigurationTypes,
    Field(discriminator="provider_type"),
]


class OIDCConfigurationPatch(SQLModel):
    """Patch schema for OIDC configuration (client_secret optional — preserves existing if omitted)."""

    provider_type: Literal["oidc"] = "oidc"

    auto_discovery: bool = Field(default=True, description="Use OIDC auto-discovery via .well-known endpoint")

    issuer_url: str = Field(description="OIDC issuer URL (e.g. https://accounts.google.com)")

    client_id: str = Field(description="OAuth 2.0 client ID")

    client_secret: str | None = Field(default=None, description="OAuth 2.0 client secret (omit to keep existing)")

    redirect_uri: str = Field(description="OAuth 2.0 redirect URI")

    scopes: str = Field(default="openid profile email", description="Space-separated list of OAuth 2.0 scopes")

    authorization_endpoint: str | None = Field(default=None, description="Authorization endpoint URL")
    token_endpoint: str | None = Field(default=None, description="Token endpoint URL")
    jwks_uri: str | None = Field(default=None, description="JWKS URI for token verification")
    userinfo_endpoint: str | None = Field(default=None, description="Userinfo endpoint URL (optional)")

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",
    )  # type: ignore[assignment]


IdentityProviderConfigurationPatchTypes = OIDCConfigurationPatch
IdentityProviderConfigurationPatch = Annotated[
    IdentityProviderConfigurationPatchTypes,
    Field(discriminator="provider_type"),
]

IdentityProviderConfigurationResponseTypes = OIDCConfigurationResponse
IdentityProviderConfigurationResponse = Annotated[
    IdentityProviderConfigurationResponseTypes,
    Field(discriminator="provider_type"),
]
