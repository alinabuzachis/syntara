from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="AAPConfiguration")


@_attrs_define
class AAPConfiguration:
    """Configuration for Ansible Automation Platform integrations.

    Attributes:
        aap_url (str): URL of the Ansible Automation Platform
        integration_type (Literal['ansible_automation_platform'] | Unset):  Default: 'ansible_automation_platform'.
        insecure_skip_tls_verify (bool | Unset): Disable TLS certificate verification. Insecure; do not enable in
            production. Default: False.
    """

    aap_url: str
    integration_type: Literal["ansible_automation_platform"] | Unset = "ansible_automation_platform"
    insecure_skip_tls_verify: bool | Unset = False

    def to_dict(self) -> dict[str, Any]:
        aap_url = self.aap_url

        integration_type = self.integration_type

        insecure_skip_tls_verify = self.insecure_skip_tls_verify

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "aap_url": aap_url,
            }
        )
        if integration_type is not UNSET:
            field_dict["integration_type"] = integration_type
        if insecure_skip_tls_verify is not UNSET:
            field_dict["insecure_skip_tls_verify"] = insecure_skip_tls_verify

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        aap_url = d.pop("aap_url")

        integration_type = cast(Literal["ansible_automation_platform"] | Unset, d.pop("integration_type", UNSET))
        if integration_type != "ansible_automation_platform" and not isinstance(integration_type, Unset):
            raise ValueError(
                f"integration_type must match const 'ansible_automation_platform', got '{integration_type}'"
            )

        insecure_skip_tls_verify = d.pop("insecure_skip_tls_verify", UNSET)

        aap_configuration = cls(
            aap_url=aap_url,
            integration_type=integration_type,
            insecure_skip_tls_verify=insecure_skip_tls_verify,
        )

        return aap_configuration
