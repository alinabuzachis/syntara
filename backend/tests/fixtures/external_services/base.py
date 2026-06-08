"""GKE provider fixtures for external services.

Duplicated from atf_sdk.fixtures.external_services.base with secrets_manager/ConfigManager
replaced by environment variables. When atf-sdk is added as a dependency, replace this
module with the atf-sdk equivalents and remove the GKE_CLUSTER_* env vars.

Required environment variables:
    GKE_CLUSTER_ENDPOINT: Kubernetes API server URL
    GKE_CLUSTER_API_KEY:  Bearer token for authentication
    GKE_CLUSTER_DOMAIN:   DNS zone for service URL construction
                          (e.g. "integration.example.com")
"""

import os
from collections.abc import Callable

import pytest
from external_services.k8s.types import K8sProvider
from external_services.types import HttpApiService
from kubernetes.client import ApiClient, Configuration


@pytest.fixture(scope="session")
def gke_ext_service_client() -> ApiClient:
    """Return a Kubernetes ApiClient configured from GKE_CLUSTER_* env vars."""
    missing = [v for v in ("GKE_CLUSTER_ENDPOINT", "GKE_CLUSTER_API_KEY") if v not in os.environ]
    if missing:
        pytest.skip(f"Required environment variables not set: {', '.join(missing)}")
    kube_config = Configuration()
    kube_config.host = os.environ["GKE_CLUSTER_ENDPOINT"]
    kube_config.verify_ssl = True
    kube_config.api_key["authorization"] = os.environ["GKE_CLUSTER_API_KEY"]
    kube_config.api_key_prefix["authorization"] = "Bearer"
    return ApiClient(configuration=kube_config)


@pytest.fixture(scope="session")
def gke_ext_service_provider(gke_ext_service_client: ApiClient) -> K8sProvider:
    """Return a K8sProvider for the 'integration' namespace."""
    return K8sProvider(namespace="integration", k8s_client=gke_ext_service_client)


@pytest.fixture(scope="session")
def gke_ext_service_url_retriever() -> Callable[[HttpApiService], str]:
    """Return a URL-retriever callable that constructs the GKE HTTPS service URL."""
    cluster_domain = os.environ["GKE_CLUSTER_DOMAIN"]
    return (
        lambda srv: f"https://http-{srv.template.vars['deployment_name']}"
        f"-port-{srv.template.vars['service_port']}"
        f".{cluster_domain}"
    )
