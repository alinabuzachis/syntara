from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, TypeVar, cast

from attrs import define as _attrs_define

from ..models.llm_provider_hint import LLMProviderHint
from ..types import UNSET, Unset

T = TypeVar("T", bound="LLMProviderConfiguration")


@_attrs_define
class LLMProviderConfiguration:
    """Configuration for LLM provider integrations.

    Attributes:
        provider_hint (LLMProviderHint): LLM provider backend type.
        integration_type (Literal['llm_provider'] | Unset):  Default: 'llm_provider'.
        base_url (None | str | Unset): Base URL for the LLM provider API. Required for red_hat_ai and custom providers.
        allow_http (bool | Unset): Allow HTTP (unencrypted) connections. Loopback addresses are always permitted over
            HTTP. Default: False.
        insecure_skip_tls_verify (bool | Unset): Disable TLS certificate verification for connections to this
            integration. Default: False.
        ca_certificate (None | str | Unset): PEM-encoded CA certificate to trust for this integration's TLS connections.
    """

    provider_hint: LLMProviderHint
    integration_type: Literal["llm_provider"] | Unset = "llm_provider"
    base_url: None | str | Unset = UNSET
    allow_http: bool | Unset = False
    insecure_skip_tls_verify: bool | Unset = False
    ca_certificate: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        provider_hint = self.provider_hint.value

        integration_type = self.integration_type

        base_url: None | str | Unset
        if isinstance(self.base_url, Unset):
            base_url = UNSET
        else:
            base_url = self.base_url

        allow_http = self.allow_http

        insecure_skip_tls_verify = self.insecure_skip_tls_verify

        ca_certificate: None | str | Unset
        if isinstance(self.ca_certificate, Unset):
            ca_certificate = UNSET
        else:
            ca_certificate = self.ca_certificate

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "provider_hint": provider_hint,
            }
        )
        if integration_type is not UNSET:
            field_dict["integration_type"] = integration_type
        if base_url is not UNSET:
            field_dict["base_url"] = base_url
        if allow_http is not UNSET:
            field_dict["allow_http"] = allow_http
        if insecure_skip_tls_verify is not UNSET:
            field_dict["insecure_skip_tls_verify"] = insecure_skip_tls_verify
        if ca_certificate is not UNSET:
            field_dict["ca_certificate"] = ca_certificate

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        provider_hint = LLMProviderHint(d.pop("provider_hint"))

        integration_type = cast(Literal["llm_provider"] | Unset, d.pop("integration_type", UNSET))
        if integration_type != "llm_provider" and not isinstance(integration_type, Unset):
            raise ValueError(f"integration_type must match const 'llm_provider', got '{integration_type}'")

        def _parse_base_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        base_url = _parse_base_url(d.pop("base_url", UNSET))

        allow_http = d.pop("allow_http", UNSET)

        insecure_skip_tls_verify = d.pop("insecure_skip_tls_verify", UNSET)

        def _parse_ca_certificate(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        ca_certificate = _parse_ca_certificate(d.pop("ca_certificate", UNSET))

        llm_provider_configuration = cls(
            provider_hint=provider_hint,
            integration_type=integration_type,
            base_url=base_url,
            allow_http=allow_http,
            insecure_skip_tls_verify=insecure_skip_tls_verify,
            ca_certificate=ca_certificate,
        )

        return llm_provider_configuration
