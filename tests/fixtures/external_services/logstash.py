"""Logstash external service fixtures.

Duplicated from atf_sdk.fixtures.external_services.logstash.
When atf-sdk is added as a dependency, replace this module with the atf-sdk equivalents.
"""

from collections.abc import Callable

import pytest
from external_services.k8s.types import K8sProvider
from external_services.plugin import ServiceCatalog
from external_services.types import HttpApiService
from external_services.utils import WaitException


@pytest.fixture(scope="session")
def logstash_service(
    request: pytest.FixtureRequest,
    gke_ext_service_provider: K8sProvider,
    gke_ext_service_url_retriever: Callable[[HttpApiService], str],
) -> HttpApiService:
    """Start a Logstash service on GKE and return its HttpApiService handle."""
    service = ServiceCatalog(provider=gke_ext_service_provider).get_service(
        service_name="logstash", url_retriever=gke_ext_service_url_retriever
    )
    request.addfinalizer(service.stop)  # noqa: PT021
    try:
        service.start()
    except WaitException:
        pytest.skip("Logstash service not available on GKE (timed out waiting for readiness)")
    return service


@pytest.fixture(scope="session")
def logstash_nginx_web_service(logstash_service: HttpApiService) -> tuple[str, int]:
    """Return the nginx (hostname, port) co-deployed alongside Logstash."""
    nginx_port = 443
    nginx_url = logstash_service.url.replace("https://", "").replace("port-8000", "port-80")
    return nginx_url, nginx_port
