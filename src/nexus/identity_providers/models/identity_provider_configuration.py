"""Identity provider configuration models.

This module contains configuration classes for different identity provider types.
Each configuration class defines the required and optional parameters for
connecting to and interacting with a specific provider type.
"""

from enum import StrEnum
from typing import Annotated, ClassVar, Literal
from uuid import UUID

import jmespath
from pydantic import ConfigDict, Field, field_validator, model_validator
from sqlmodel import SQLModel

from nexus.core.lib.consumer_configuration import BaseConsumerConfiguration


class OIDCIdpType(StrEnum):
    """Known OIDC identity provider types for pre-configured UI defaults."""

    AAP = "aap"
    CUSTOM = "custom"


class OIDCClaimMapping(SQLModel):
    """Maps Nexus user fields to IdP-specific OIDC claim names."""

    subject: str = Field(default="sub")
    email: str = Field(default="email")
    username: str = Field(default="preferred_username")
    full_name: str = Field(default="name")
    groups: str | None = Field(default=None)

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]


class OIDCGroupMappingEntry(SQLModel):
    """API-facing schema for a single IdP-to-Nexus group mapping entry.

    Used in API requests/responses. Actual storage is in the
    ``idp_group_mapping_entries`` table.
    """

    idp_group_value: str = Field(min_length=1, description="Group value from the IdP token (e.g. GUID or role name)")
    nexus_group_id: UUID = Field(description="ID of the Nexus group to map to")

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]


def _validate_jmespath(v: str | None) -> str | None:
    """Validate a JMESPath expression, returning it unchanged or raising ValueError."""
    if v is None:
        return v
    try:
        jmespath.compile(v)
    except jmespath.exceptions.JMESPathError as e:
        msg = f"Invalid group extraction expression: '{v}' is not a valid JMESPath expression"
        raise ValueError(msg) from e
    return v


def _validate_idp_type(v: str | None) -> str | None:
    """Validate idp_type against known provider types."""
    if v is None:
        return v
    known = {e.value for e in OIDCIdpType}
    if v not in known:
        msg = f"Unknown idp_type '{v}'. Known values: {', '.join(sorted(known))}"
        raise ValueError(msg)
    return v


class OIDCConfiguration(BaseConsumerConfiguration):
    """Configuration for OIDC (OpenID Connect) providers."""

    provider_type: Literal["oidc"] = "oidc"

    idp_type: str | None = Field(
        default=None,
        description=f"Identity provider type hint. Known values: {', '.join(v.value for v in OIDCIdpType)}",
    )

    auto_discovery: bool = Field(default=True, description="Use OIDC auto-discovery via .well-known endpoint")

    issuer_url: str = Field(description="OIDC issuer URL (e.g. https://accounts.google.com)")

    client_id: str = Field(description="OAuth 2.0 client ID")

    client_secret: str | None = Field(default=None, description="OAuth 2.0 client secret")

    redirect_uri: str = Field(description="OAuth 2.0 redirect URI")

    scopes: str = Field(default="openid profile email", description="Space-separated list of OAuth 2.0 scopes")

    # Manual endpoint fields (used when auto_discovery is disabled)
    authorization_endpoint: str | None = Field(default=None, description="Authorization endpoint URL")
    token_endpoint: str | None = Field(default=None, description="Token endpoint URL")
    jwks_uri: str | None = Field(default=None, description="JWKS URI for token verification")
    userinfo_endpoint: str | None = Field(default=None, description="Userinfo endpoint URL (optional)")
    end_session_endpoint: str | None = Field(
        default=None, description="OIDC end session endpoint URL for RP-initiated logout"
    )

    # RP-initiated logout configuration
    enable_rp_initiated_logout: bool = Field(
        default=False,
        description="Enable RP-initiated logout redirect to IdP when user logs out",
    )

    claim_mapping: OIDCClaimMapping = Field(default_factory=OIDCClaimMapping)

    # Group mapping — jmespath_expression is persisted in JSONB;
    # group_mapping_entries is a pass-through stored in the idp_group_mapping_entries table.
    group_jmespath_expression: str | None = Field(
        default=None, description="JMESPath expression to extract group values from token claims"
    )
    group_mapping_entries: list[OIDCGroupMappingEntry] = Field(
        default_factory=list,
        exclude=True,
        description="IdP-to-Nexus group mapping entries",
    )
    allow_all_authenticated: bool = Field(
        default=False, description="Allow all users from this IdP to log in regardless of group mapping results"
    )
    aap_role_mapping_enabled: bool = Field(
        default=False,
        description="Map AAP aap_system_role claim to built-in groups",
    )
    disable_tls_verify: bool = Field(
        default=False,
        description="Disable TLS certificate verification for requests to this identity provider (insecure)",
    )

    @field_validator("idp_type")
    @classmethod
    def validate_idp_type(cls, v: str | None) -> str | None:
        """Validate idp_type against known provider types."""
        return _validate_idp_type(v)

    @field_validator("group_jmespath_expression")
    @classmethod
    def validate_group_jmespath_expression(cls, v: str | None) -> str | None:
        """Reject syntactically invalid JMESPath expressions at configuration time."""
        return _validate_jmespath(v)

    @model_validator(mode="after")
    def validate_aap_role_mapping_requires_aap_type(self) -> "OIDCConfiguration":
        """Reject aap_role_mapping_enabled on non-AAP identity providers."""
        if self.aap_role_mapping_enabled and self.idp_type != OIDCIdpType.AAP:
            msg = "aap_role_mapping_enabled requires idp_type to be 'aap'"
            raise ValueError(msg)
        return self

    @classmethod
    def sensitive_fields(cls) -> frozenset[str]:
        """Declare client_secret as a sensitive field for SecretService encryption."""
        return frozenset({"client_secret"})


class OIDCConfigurationResponse(SQLModel):
    """Response schema for OIDC configuration (excludes client_secret)."""

    provider_type: Literal["oidc"] = "oidc"

    idp_type: str | None = Field(default=None, description="Identity provider type hint")

    auto_discovery: bool = Field(default=True, description="Use OIDC auto-discovery via .well-known endpoint")

    issuer_url: str = Field(description="OIDC issuer URL (e.g. https://accounts.google.com)")

    client_id: str = Field(description="OAuth 2.0 client ID")

    redirect_uri: str = Field(description="OAuth 2.0 redirect URI")

    scopes: str = Field(default="openid profile email", description="Space-separated list of OAuth 2.0 scopes")

    authorization_endpoint: str | None = Field(default=None, description="Authorization endpoint URL")
    token_endpoint: str | None = Field(default=None, description="Token endpoint URL")
    jwks_uri: str | None = Field(default=None, description="JWKS URI for token verification")
    userinfo_endpoint: str | None = Field(default=None, description="Userinfo endpoint URL (optional)")
    end_session_endpoint: str | None = Field(
        default=None, description="OIDC end session endpoint URL for RP-initiated logout"
    )

    enable_rp_initiated_logout: bool = Field(
        default=False,
        description="Enable RP-initiated logout redirect to IdP when user logs out",
    )

    claim_mapping: OIDCClaimMapping = Field(default_factory=OIDCClaimMapping)
    group_jmespath_expression: str | None = Field(default=None, description="JMESPath expression for group extraction")
    group_mapping_entries: list[OIDCGroupMappingEntry] = Field(
        default_factory=list, description="IdP-to-Nexus group mapping entries"
    )
    allow_all_authenticated: bool = Field(
        default=False, description="Allow all users from this IdP to log in regardless of group mapping results"
    )
    aap_role_mapping_enabled: bool = Field(
        default=False,
        description="Map AAP aap_system_role claim to built-in groups",
    )
    disable_tls_verify: bool = Field(
        default=False,
        description="Disable TLS certificate verification for requests to this identity provider (insecure)",
    )

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


class OIDCConfigurationPatch(BaseConsumerConfiguration):
    """Patch schema for OIDC configuration (client_secret optional — preserves existing if omitted)."""

    provider_type: Literal["oidc"] = "oidc"

    idp_type: str | None = Field(
        default=None,
        description=f"Identity provider type hint. Known values: {', '.join(v.value for v in OIDCIdpType)}",
    )

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
    end_session_endpoint: str | None = Field(
        default=None, description="OIDC end session endpoint URL for RP-initiated logout (omit to keep existing)"
    )

    enable_rp_initiated_logout: bool | None = Field(
        default=None,
        description="Enable RP-initiated logout redirect to IdP when user logs out (omit to keep existing)",
    )

    claim_mapping: OIDCClaimMapping | None = Field(
        default=None, description="OIDC claim mapping (omit to keep existing)"
    )
    group_jmespath_expression: str | None = Field(
        default=None, description="JMESPath expression for group extraction (omit to keep existing)"
    )
    group_mapping_entries: list[OIDCGroupMappingEntry] | None = Field(
        default=None,
        exclude=True,
        description="IdP-to-Nexus group mapping entries (omit to keep existing)",
    )
    allow_all_authenticated: bool | None = Field(
        default=None,
        description=(
            "Allow all users from this IdP to log in regardless of group mapping results (omit to keep existing)"
        ),
    )
    aap_role_mapping_enabled: bool | None = Field(
        default=None,
        description="Map AAP aap_system_role claim to built-in groups (omit to keep existing)",
    )
    disable_tls_verify: bool | None = Field(
        default=None,
        description="Disable TLS certificate verification for this identity provider (omit to keep existing)",
    )

    @field_validator("idp_type")
    @classmethod
    def validate_idp_type(cls, v: str | None) -> str | None:
        """Validate idp_type against known provider types."""
        return _validate_idp_type(v)

    @field_validator("group_jmespath_expression")
    @classmethod
    def validate_group_jmespath_expression(cls, v: str | None) -> str | None:
        """Reject syntactically invalid JMESPath expressions at configuration time."""
        return _validate_jmespath(v)

    @classmethod
    def sensitive_fields(cls) -> frozenset[str]:
        """Declare client_secret as a sensitive field for SecretService encryption."""
        return frozenset({"client_secret"})


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
