from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="AAPGatewayConfiguration")


@_attrs_define
class AAPGatewayConfiguration:
    """Configuration for Ansible Automation Platform Gateway integrations.

    Attributes:
        gateway_url (str): URL of the AAP Gateway
        integration_type (Literal['aap_gateway'] | Unset):  Default: 'aap_gateway'.
        insecure_skip_tls_verify (bool | Unset): Disable TLS certificate verification. Insecure; do not enable in
            production. Default: False.
    """

    gateway_url: str
    integration_type: Literal["aap_gateway"] | Unset = "aap_gateway"
    insecure_skip_tls_verify: bool | Unset = False

    def to_dict(self) -> dict[str, Any]:
        gateway_url = self.gateway_url

        integration_type = self.integration_type

        insecure_skip_tls_verify = self.insecure_skip_tls_verify

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "gateway_url": gateway_url,
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
        gateway_url = d.pop("gateway_url")

        integration_type = cast(Literal["aap_gateway"] | Unset, d.pop("integration_type", UNSET))
        if integration_type != "aap_gateway" and not isinstance(integration_type, Unset):
            raise ValueError(f"integration_type must match const 'aap_gateway', got '{integration_type}'")

        insecure_skip_tls_verify = d.pop("insecure_skip_tls_verify", UNSET)

        aap_gateway_configuration = cls(
            gateway_url=gateway_url,
            integration_type=integration_type,
            insecure_skip_tls_verify=insecure_skip_tls_verify,
        )

        return aap_gateway_configuration
