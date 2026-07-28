"""TLS helpers for E2E tests."""

from __future__ import annotations

import os
import ssl
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def e2e_ssl_context() -> ssl.SSLContext | bool:
    """Build an SSL context for E2E tests.

    When APP_S2S_TLS_CA_CERT_PATH is set, returns an SSLContext that
    trusts that CA (for verifying self-signed ingress certificates).
    Otherwise returns False to skip server verification.
    """
    ca = os.environ.get("APP_S2S_TLS_CA_CERT_PATH")
    if not (ca and Path(ca).exists()):
        return False
    ctx = ssl.create_default_context(cafile=ca)
    ctx.check_hostname = False
    return ctx
