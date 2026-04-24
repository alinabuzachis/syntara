from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="OIDCConfigurationResponse")


@_attrs_define
class OIDCConfigurationResponse:
    """Response schema for OIDC configuration (excludes client_secret).

    Attributes:
        issuer_url (str): OIDC issuer URL (e.g. https://accounts.google.com)
        client_id (str): OAuth 2.0 client ID
        redirect_uri (str): OAuth 2.0 redirect URI
        provider_type (Literal['oidc'] | Unset):  Default: 'oidc'.
        auto_discovery (bool | Unset): Use OIDC auto-discovery via .well-known endpoint Default: True.
        scopes (str | Unset): Space-separated list of OAuth 2.0 scopes Default: 'openid profile email'.
        authorization_endpoint (None | str | Unset): Authorization endpoint URL
        token_endpoint (None | str | Unset): Token endpoint URL
        jwks_uri (None | str | Unset): JWKS URI for token verification
        userinfo_endpoint (None | str | Unset): Userinfo endpoint URL (optional)
    """

    issuer_url: str
    client_id: str
    redirect_uri: str
    provider_type: Literal["oidc"] | Unset = "oidc"
    auto_discovery: bool | Unset = True
    scopes: str | Unset = "openid profile email"
    authorization_endpoint: None | str | Unset = UNSET
    token_endpoint: None | str | Unset = UNSET
    jwks_uri: None | str | Unset = UNSET
    userinfo_endpoint: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        issuer_url = self.issuer_url

        client_id = self.client_id

        redirect_uri = self.redirect_uri

        provider_type = self.provider_type

        auto_discovery = self.auto_discovery

        scopes = self.scopes

        authorization_endpoint: None | str | Unset
        if isinstance(self.authorization_endpoint, Unset):
            authorization_endpoint = UNSET
        else:
            authorization_endpoint = self.authorization_endpoint

        token_endpoint: None | str | Unset
        if isinstance(self.token_endpoint, Unset):
            token_endpoint = UNSET
        else:
            token_endpoint = self.token_endpoint

        jwks_uri: None | str | Unset
        if isinstance(self.jwks_uri, Unset):
            jwks_uri = UNSET
        else:
            jwks_uri = self.jwks_uri

        userinfo_endpoint: None | str | Unset
        if isinstance(self.userinfo_endpoint, Unset):
            userinfo_endpoint = UNSET
        else:
            userinfo_endpoint = self.userinfo_endpoint

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "issuer_url": issuer_url,
                "client_id": client_id,
                "redirect_uri": redirect_uri,
            }
        )
        if provider_type is not UNSET:
            field_dict["provider_type"] = provider_type
        if auto_discovery is not UNSET:
            field_dict["auto_discovery"] = auto_discovery
        if scopes is not UNSET:
            field_dict["scopes"] = scopes
        if authorization_endpoint is not UNSET:
            field_dict["authorization_endpoint"] = authorization_endpoint
        if token_endpoint is not UNSET:
            field_dict["token_endpoint"] = token_endpoint
        if jwks_uri is not UNSET:
            field_dict["jwks_uri"] = jwks_uri
        if userinfo_endpoint is not UNSET:
            field_dict["userinfo_endpoint"] = userinfo_endpoint

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        issuer_url = d.pop("issuer_url")

        client_id = d.pop("client_id")

        redirect_uri = d.pop("redirect_uri")

        provider_type = cast(Literal["oidc"] | Unset, d.pop("provider_type", UNSET))
        if provider_type != "oidc" and not isinstance(provider_type, Unset):
            raise ValueError(f"provider_type must match const 'oidc', got '{provider_type}'")

        auto_discovery = d.pop("auto_discovery", UNSET)

        scopes = d.pop("scopes", UNSET)

        def _parse_authorization_endpoint(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        authorization_endpoint = _parse_authorization_endpoint(d.pop("authorization_endpoint", UNSET))

        def _parse_token_endpoint(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        token_endpoint = _parse_token_endpoint(d.pop("token_endpoint", UNSET))

        def _parse_jwks_uri(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        jwks_uri = _parse_jwks_uri(d.pop("jwks_uri", UNSET))

        def _parse_userinfo_endpoint(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        userinfo_endpoint = _parse_userinfo_endpoint(d.pop("userinfo_endpoint", UNSET))

        oidc_configuration_response = cls(
            issuer_url=issuer_url,
            client_id=client_id,
            redirect_uri=redirect_uri,
            provider_type=provider_type,
            auto_discovery=auto_discovery,
            scopes=scopes,
            authorization_endpoint=authorization_endpoint,
            token_endpoint=token_endpoint,
            jwks_uri=jwks_uri,
            userinfo_endpoint=userinfo_endpoint,
        )

        return oidc_configuration_response
