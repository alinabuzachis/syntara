from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="AAPOIDCSetupRequest")


@_attrs_define
class AAPOIDCSetupRequest:
    """Request body for push-button Ansible Automation Platform OIDC identity provider setup.

    Attributes:
        aap_url (str): Ansible Automation Platform base URL (e.g., https://aap.example.com)
        organization (str | Unset): Ansible Automation Platform organization name to create the OAuth2 application in
            Default: 'Default'.
        admin_username (None | str | Unset): Ansible Automation Platform platform admin username (required when using
            basic auth)
        admin_password (None | str | Unset): Ansible Automation Platform platform admin password (used only for setup,
            never stored)
        personal_access_token (None | str | Unset): Ansible Automation Platform personal access token (alternative to
            username/password, never stored)
        insecure_skip_tls_verify (bool | Unset): Skip TLS certificate verification for the Ansible Automation Platform
            connection Default: False.
    """

    aap_url: str
    organization: str | Unset = "Default"
    admin_username: None | str | Unset = UNSET
    admin_password: None | str | Unset = UNSET
    personal_access_token: None | str | Unset = UNSET
    insecure_skip_tls_verify: bool | Unset = False

    def to_dict(self) -> dict[str, Any]:
        aap_url = self.aap_url

        organization = self.organization

        admin_username: None | str | Unset
        if isinstance(self.admin_username, Unset):
            admin_username = UNSET
        else:
            admin_username = self.admin_username

        admin_password: None | str | Unset
        if isinstance(self.admin_password, Unset):
            admin_password = UNSET
        else:
            admin_password = self.admin_password

        personal_access_token: None | str | Unset
        if isinstance(self.personal_access_token, Unset):
            personal_access_token = UNSET
        else:
            personal_access_token = self.personal_access_token

        insecure_skip_tls_verify = self.insecure_skip_tls_verify

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "aap_url": aap_url,
            }
        )
        if organization is not UNSET:
            field_dict["organization"] = organization
        if admin_username is not UNSET:
            field_dict["admin_username"] = admin_username
        if admin_password is not UNSET:
            field_dict["admin_password"] = admin_password
        if personal_access_token is not UNSET:
            field_dict["personal_access_token"] = personal_access_token
        if insecure_skip_tls_verify is not UNSET:
            field_dict["insecure_skip_tls_verify"] = insecure_skip_tls_verify

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        aap_url = d.pop("aap_url")

        organization = d.pop("organization", UNSET)

        def _parse_admin_username(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        admin_username = _parse_admin_username(d.pop("admin_username", UNSET))

        def _parse_admin_password(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        admin_password = _parse_admin_password(d.pop("admin_password", UNSET))

        def _parse_personal_access_token(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        personal_access_token = _parse_personal_access_token(d.pop("personal_access_token", UNSET))

        insecure_skip_tls_verify = d.pop("insecure_skip_tls_verify", UNSET)

        aapoidc_setup_request = cls(
            aap_url=aap_url,
            organization=organization,
            admin_username=admin_username,
            admin_password=admin_password,
            personal_access_token=personal_access_token,
            insecure_skip_tls_verify=insecure_skip_tls_verify,
        )

        return aapoidc_setup_request
