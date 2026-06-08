"""Connectivity check utilities for external service fixtures.

Duplicated from atf_sdk.fixtures.external_services.connectivity_check.
When atf-sdk is added as a dependency, remove this file and update imports.
"""

import socket
import time
from collections.abc import Callable
from urllib.parse import urlparse

import pytest
from external_services.types import (
    HttpApiService,
    ServiceImpl,
    TCPService,
)


def _resolve_dns(address: str, port: int) -> tuple[str | None, list[str]]:
    try:
        addr_info = socket.getaddrinfo(address, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
        resolved_ips = [str(info[4][0]) for info in addr_info]
        return None, resolved_ips
    except Exception as e:
        return f"DNS resolution failed: {e}", []


def _check_connectivity_with_retry(
    is_alive_fn: Callable[[], bool],
    max_retries: int,
    retry_delay: float,
) -> tuple[bool, float, float]:
    overall_start_time = time.time()
    last_attempt_duration = 0.0

    for attempt in range(1, max_retries + 1):
        start_time = time.time()
        is_alive = is_alive_fn()
        last_attempt_duration = time.time() - start_time

        if is_alive:
            total_wall_time = time.time() - overall_start_time
            return True, total_wall_time, last_attempt_duration

        if attempt < max_retries:
            time.sleep(retry_delay)

    total_wall_time = time.time() - overall_start_time
    return False, total_wall_time, last_attempt_duration


def verify_service_connectivity(
    service_name: str,
    service: ServiceImpl,
    max_retries: int = 3,
    retry_delay: float = 2.0,
) -> None:
    """Verify an external service can be reached.

    Raises pytest.fail if the service is not reachable after all retries.
    """
    if isinstance(service, TCPService):
        address = service.address
        port = service.port
    elif isinstance(service, HttpApiService):
        parsed = urlparse(service.url)
        address = parsed.hostname or "unknown"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    else:
        msg = (
            f"Unsupported service type {type(service).__name__}."
            " verify_service_connectivity supports TCPService and HttpApiService."
        )
        raise TypeError(msg)

    dns_error, resolved_ips = _resolve_dns(address, port)

    if dns_error:
        pytest.fail(
            f"{service_name} is not reachable at {address}:{port}.\n"
            f"DNS Issue: {dns_error}\n"
            "The infrastructure is in a bad state."
        )

    is_alive, total_wall_time, last_attempt_duration = _check_connectivity_with_retry(
        service.is_alive, max_retries, retry_delay
    )

    if not is_alive:
        diagnosis = "No diagnosis available for this service type"
        if hasattr(service, "diagnose_connection"):
            diagnosis = service.diagnose_connection()
        error_parts = [
            f"{service_name} is not running at {address}:{port}.",
            f"Failed after {max_retries} attempts.",
            f"Total time: {total_wall_time:.2f}s (last attempt: {last_attempt_duration:.2f}s).",
            f"DNS resolved to: {', '.join(resolved_ips)}.",
            f"Connection diagnosis: {diagnosis}.",
            "The infrastructure is in a bad state.",
        ]
        pytest.fail("\n".join(error_parts))
