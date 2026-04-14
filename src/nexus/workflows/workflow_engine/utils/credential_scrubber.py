"""Credential scrubbing utility for workflow execution state.

Strips credential-related keys from dicts to prevent secret values
from persisting in execution records, Temporal history, or Redis streams.

This is partial scrubbing (Phases 12-16). Full 7-layer scrubbing is in Epic 4.
"""

import json
from typing import Any

REDACTED = "[REDACTED]"

# Internal keys used to pass resolved credentials through workflow state
_INTERNAL_CREDENTIAL_KEYS = frozenset({"_resolved_credentials", "activity_credentials"})


def _build_credential_keys() -> frozenset[str]:
    """Derive scrub keys from GA credential type injector definitions.

    Automatically covers all injector extra_vars keys from preseed types,
    so new credential types don't need manual additions here.
    """
    from nexus.credentials.lib.preseed import GA_CREDENTIAL_TYPES  # noqa: PLC0415

    keys: set[str] = set(_INTERNAL_CREDENTIAL_KEYS)
    for type_def in GA_CREDENTIAL_TYPES:
        keys.update(type_def["injectors"].get("extra_vars", {}).keys())
    return frozenset(keys)


CREDENTIAL_KEYS = _build_credential_keys()


def has_credential_keys(obj: Any) -> bool:  # noqa: ANN401
    """Check if a value contains any credential keys (recursive).

    Used by the PayloadCodec to decide whether a payload needs encryption.
    """
    if isinstance(obj, dict):
        if any(k in CREDENTIAL_KEYS for k in obj):
            return True
        return any(has_credential_keys(v) for v in obj.values())
    if isinstance(obj, list):
        return any(has_credential_keys(item) for item in obj)
    return False


def ensure_resolved_credentials_dict(resolved_creds: Any) -> dict[str, Any]:  # noqa: ANN401
    """Normalize _resolved_credentials from Temporal to a dict.

    Temporal may deserialize nested JSON payloads as strings rather than dicts.
    This ensures we always have a dict for downstream credential processing.

    Returns empty dict if the input cannot be parsed.
    """
    if isinstance(resolved_creds, dict):
        return resolved_creds
    if isinstance(resolved_creds, str):
        try:
            result: dict[str, Any] = json.loads(resolved_creds)
            return result
        except (json.JSONDecodeError, ValueError):
            return {}
    return {}


def scrub_credentials(data: Any) -> Any:  # noqa: ANN401
    """Strip credential-related keys from a data structure.

    Deep copies the input and replaces values of credential keys with [REDACTED].
    Non-credential data is preserved unchanged.

    Args:
        data: Dict, list, or other value to scrub.

    Returns:
        Deep copy with credential values redacted.

    """
    if data is None:
        return None

    if isinstance(data, dict):
        scrubbed = {}
        for key, value in data.items():
            if key in CREDENTIAL_KEYS:
                scrubbed[key] = REDACTED
            else:
                scrubbed[key] = scrub_credentials(value)
        return scrubbed

    if isinstance(data, list):
        return [scrub_credentials(item) for item in data]

    return data
