"""OpenLDAP external service fixture.

Duplicated from atf_sdk.fixtures.external_services.openldap:
- OpenldapServiceWrapper only exposes ldap_url, ldaps_url, ldaps_lb_dns_url, _validate_url
- LDIF data is a static inline string instead of a rendered Jinja2 template
- ConfigManager replaced by GKE_CLUSTER_DOMAIN env var

When atf-sdk is added as a dependency, replace this module with the atf-sdk equivalents.
"""

import dataclasses
import os
from typing import TypedDict
from urllib.parse import urlparse

import pytest
from external_services.k8s.types import K8sProvider
from external_services.plugin import ServiceCatalog
from external_services.types import TCPService
from external_services.utils import WaitException

from tests.fixtures.external_services.connectivity_check import verify_service_connectivity

_LDIF_DATA = """\
dn: ou=users,dc=testing,dc=ansible,dc=com
objectClass: organizationalUnit
ou: users

dn: ou=groups,dc=testing,dc=ansible,dc=com
objectClass: organizationalUnit
ou: groups

dn: uid=bbelcher,ou=users,dc=testing,dc=ansible,dc=com
objectClass: inetOrgPerson
objectClass: posixAccount
objectClass: shadowAccount
uid: bbelcher
sn: Belcher
givenName: Bob
cn: Bob Belcher
mail: bbelcher@testing.ansible.com
uidNumber: 1000
gidNumber: 1000
homeDirectory: /home/bbelcher
userPassword: password

dn: uid=libelcher,ou=users,dc=testing,dc=ansible,dc=com
objectClass: inetOrgPerson
objectClass: posixAccount
objectClass: shadowAccount
uid: libelcher
sn: Belcher
givenName: Linda
cn: Linda Belcher
mail: libelcher@testing.ansible.com
uidNumber: 1001
gidNumber: 1001
homeDirectory: /home/libelcher
userPassword: password
"""


class OpenldapServiceParameters(TypedDict):
    """OpenLDAP Service Parameters."""

    service_type: str
    admin_username: str
    admin_password: str
    ldap_root: str
    ldap_admin_dn: str
    ldap_ldif_data: str


DEFAULT_OPENLDAP_SETTINGS = OpenldapServiceParameters(
    service_type="LoadBalancer",
    admin_username="admin",
    admin_password="adminpassword",  # noqa: S106
    ldap_root="dc=testing,dc=ansible,dc=com",
    ldap_admin_dn="cn=admin,dc=testing,dc=ansible,dc=com",
    ldap_ldif_data=_LDIF_DATA,
)


@dataclasses.dataclass
class OpenldapServiceWrapper:
    """Wrapper around a deployed OpenLDAP TCPService.

    Exposes URL helpers. Matches the subset of atf_sdk.fixtures.external_services.openldap
    OpenldapServiceWrapper used by nexus tests.
    """

    deployment: TCPService
    cluster_domain: str = dataclasses.field(default_factory=lambda: os.environ["GKE_CLUSTER_DOMAIN"])

    @property
    def ldap_url(self) -> str:
        """Return ldap://<address>:<port>."""
        return self._validate_url(f"ldap://{self.deployment.address}:{self.deployment.port}")

    @property
    def ldaps_url(self) -> str:
        """Return ldaps://<address>:<port>."""
        return self._validate_url(self.ldap_url.replace("ldap://", "ldaps://"))

    @property
    def ldaps_lb_dns_url(self) -> str:
        """Return ldaps://<deployment-name>.<cluster-domain>:<port>."""
        dep_name = self.deployment.template.vars["deployment_name"]
        return self._validate_url(f"ldaps://{dep_name}.{self.cluster_domain}:{self.deployment.port}")

    def _validate_url(self, url: str) -> str:
        parsed = urlparse(url)
        if not all([parsed.scheme, parsed.hostname, parsed.port]):
            msg = f"Invalid OpenLDAP URL: '{url}'"
            raise ValueError(msg)
        return url


@pytest.fixture(scope="class")
def openldap_service(
    request: pytest.FixtureRequest,
    gke_ext_service_provider: K8sProvider,
) -> OpenldapServiceWrapper:
    """Deploy an OpenLDAP service on GKE and return an OpenldapServiceWrapper."""

    def get_ingress_address(srv: TCPService) -> tuple[str, int]:
        address = srv.provider.get_service_address(srv.deploy_result, srv.template)
        return address, 1389

    service_settings = DEFAULT_OPENLDAP_SETTINGS
    if hasattr(request, "param") and request.param is not None:
        service_settings = request.param

    service = ServiceCatalog(provider=gke_ext_service_provider).get_service(
        service_name="openldap",
        template_vars=service_settings,
        address_retriever=get_ingress_address,
    )
    request.addfinalizer(service.stop)  # noqa: PT021
    try:
        service.start()
    except WaitException:
        pytest.skip("OpenLDAP service not available on GKE (timed out waiting for readiness)")
    verify_service_connectivity("LDAP", service)
    return OpenldapServiceWrapper(deployment=service)
