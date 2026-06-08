from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="OIDCClaimMapping")


@_attrs_define
class OIDCClaimMapping:
    """Maps Nexus user fields to IdP-specific OIDC claim names.

    Attributes:
        subject (str | Unset):  Default: 'sub'.
        email (str | Unset):  Default: 'email'.
        username (str | Unset):  Default: 'preferred_username'.
        first_name (str | Unset):  Default: 'given_name'.
        last_name (str | Unset):  Default: 'family_name'.
        groups (None | str | Unset):
    """

    subject: str | Unset = "sub"
    email: str | Unset = "email"
    username: str | Unset = "preferred_username"
    first_name: str | Unset = "given_name"
    last_name: str | Unset = "family_name"
    groups: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        subject = self.subject

        email = self.email

        username = self.username

        first_name = self.first_name

        last_name = self.last_name

        groups: None | str | Unset
        if isinstance(self.groups, Unset):
            groups = UNSET
        else:
            groups = self.groups

        field_dict: dict[str, Any] = {}

        field_dict.update({})
        if subject is not UNSET:
            field_dict["subject"] = subject
        if email is not UNSET:
            field_dict["email"] = email
        if username is not UNSET:
            field_dict["username"] = username
        if first_name is not UNSET:
            field_dict["first_name"] = first_name
        if last_name is not UNSET:
            field_dict["last_name"] = last_name
        if groups is not UNSET:
            field_dict["groups"] = groups

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        subject = d.pop("subject", UNSET)

        email = d.pop("email", UNSET)

        username = d.pop("username", UNSET)

        first_name = d.pop("first_name", UNSET)

        last_name = d.pop("last_name", UNSET)

        def _parse_groups(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        groups = _parse_groups(d.pop("groups", UNSET))

        oidc_claim_mapping = cls(
            subject=subject,
            email=email,
            username=username,
            first_name=first_name,
            last_name=last_name,
            groups=groups,
        )

        return oidc_claim_mapping
