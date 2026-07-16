"""TLS helpers for E2E tests connecting to CERT_REQUIRED backends."""

from __future__ import annotations

import os
import ssl
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def e2e_ssl_context() -> ssl.SSLContext | bool:
    """Build an SSL context for E2E tests connecting to CERT_REQUIRED backends.

    When S2S TLS cert paths are set, returns
    an SSLContext that presents the client cert. Otherwise returns False
    to skip server verification (local dev with CERT_OPTIONAL).
    """
    ca = os.environ.get("APP_S2S_TLS_CA_CERT_PATH")
    cert = os.environ.get("APP_S2S_TLS_CERT_PATH")
    key = os.environ.get("APP_S2S_TLS_KEY_PATH")
    if not (ca and cert and key and Path(ca).exists()):
        return False
    ctx = ssl.create_default_context(cafile=ca)
    ctx.check_hostname = False
    ctx.load_cert_chain(certfile=cert, keyfile=key)
    return ctx
