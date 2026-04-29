"""Azure AD (Entra ID) external service fixture.

Duplicated from atf_sdk.fixtures.external_services.azuread with secrets_manager/Dynaconf
replaced by environment variables. When atf-sdk is added as a dependency, replace this
module with the atf-sdk equivalents and remove the AZURE_AD_* env vars.

Required environment variables:
    AZURE_AD_TENANT_ID:     Azure AD tenant ID
    AZURE_AD_CLIENT_ID:     Service principal client ID used to manage app registrations
    AZURE_AD_CLIENT_SECRET: Service principal client secret
"""

# mypy: disable-error-code="index"
import asyncio
import dataclasses
import logging
import os
from collections.abc import Generator

import pytest
from azure.identity import ClientSecretCredential
from kiota_abstractions.base_request_configuration import RequestConfiguration
from msgraph.generated.models.application import Application
from msgraph.generated.models.o_auth2_permission_grant import OAuth2PermissionGrant
from msgraph.generated.models.password_credential import PasswordCredential
from msgraph.generated.models.required_resource_access import RequiredResourceAccess
from msgraph.generated.models.resource_access import ResourceAccess
from msgraph.generated.models.service_principal import ServicePrincipal
from msgraph.generated.models.web_application import WebApplication
from msgraph.generated.service_principals.service_principals_request_builder import (
    ServicePrincipalsRequestBuilder,
)
from msgraph.graph_service_client import GraphServiceClient

logger = logging.getLogger(__name__)

_AZURE_ENV_VARS = ("AZURE_AD_TENANT_ID", "AZURE_AD_CLIENT_ID", "AZURE_AD_CLIENT_SECRET")


@dataclasses.dataclass
class AzureAuthTestSet:
    """Stores all the information about deployed Azure AD resources."""

    client_id: str
    secret: str


@pytest.fixture(scope="class")
def azure_ad_ext_service_client() -> GraphServiceClient:
    """Azure msgraph client configured from AZURE_AD_* environment variables."""
    missing = [v for v in _AZURE_ENV_VARS if v not in os.environ]
    if missing:
        pytest.skip(f"Required environment variables not set: {', '.join(missing)}")
    credentials = ClientSecretCredential(
        tenant_id=os.environ["AZURE_AD_TENANT_ID"],
        client_id=os.environ["AZURE_AD_CLIENT_ID"],
        client_secret=os.environ["AZURE_AD_CLIENT_SECRET"],
    )
    return GraphServiceClient(credentials=credentials, scopes=["https://graph.microsoft.com/.default"])


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Session-scoped event loop for Azure AD async operations.

    Workaround for https://github.com/microsoftgraph/msgraph-sdk-python/issues/366.
    """
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="class")
def azure_ad_testset(
    event_loop: asyncio.AbstractEventLoop,
    request: pytest.FixtureRequest,
    azure_ad_ext_service_client: GraphServiceClient,
) -> AzureAuthTestSet:
    """Create an Azure AD application registration with password credentials.

    Registers a finalizer to delete the application after the test class completes.
    """

    async def create_application() -> Application:
        request_body = Application(
            display_name="nexus-ci-e2e",
            password_credentials=[PasswordCredential(display_name="nexus E2E test secret")],
            required_resource_access=[
                RequiredResourceAccess(
                    resource_access=[
                        ResourceAccess(
                            # User.Read delegated permission
                            id="e1fe6dd8-ba31-4d61-89e7-88639da4683d",  # type: ignore[arg-type]
                            type="Scope",
                        )
                    ],
                    resource_app_id="00000003-0000-0000-c000-000000000000",
                )
            ],
            web=WebApplication(redirect_uris=[]),
        )
        result = await azure_ad_ext_service_client.applications.post(request_body)
        assert result is not None

        # Azure AD may need time to propagate the newly created application.
        max_retries = 5
        retry_delay = 5
        result_sp = None
        for attempt in range(max_retries):
            try:
                result_sp = await azure_ad_ext_service_client.service_principals.post(
                    ServicePrincipal(app_id=result.app_id)
                )
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                logger.warning(
                    "Service principal creation failed (attempt %d/%d), "
                    "retrying in %ds for Azure AD propagation... Error: %s",
                    attempt + 1,
                    max_retries,
                    retry_delay,
                    str(e),
                )
                await asyncio.sleep(retry_delay)
        assert result_sp is not None

        ms_graph_app_id = "00000003-0000-0000-c000-000000000000"
        query_params = ServicePrincipalsRequestBuilder.ServicePrincipalsRequestBuilderGetQueryParameters(
            filter=f"appId eq '{ms_graph_app_id}'",
            select=["id"],
        )
        config = RequestConfiguration(query_parameters=query_params)
        graph_sp_response = await azure_ad_ext_service_client.service_principals.get(request_configuration=config)
        assert graph_sp_response is not None, f"Microsoft Graph service principal not found for appId {ms_graph_app_id}"
        assert graph_sp_response.value, f"Microsoft Graph service principal not found for appId {ms_graph_app_id}"
        graph_sp_id = graph_sp_response.value[0].id

        # Grant User.Read delegated permission; Azure AD eventual consistency may cause
        # this to fail immediately after SP creation, so we retry.
        app_ra_body = OAuth2PermissionGrant(
            client_id=result_sp.id,
            consent_type="AllPrincipals",
            resource_id=graph_sp_id,
            scope="User.Read",
        )
        for attempt in range(max_retries):
            try:
                await azure_ad_ext_service_client.oauth2_permission_grants.post(app_ra_body)
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                logger.warning(
                    "OAuth2 permission grant failed (attempt %d/%d), "
                    "retrying in %ds for Azure AD propagation... Error: %s",
                    attempt + 1,
                    max_retries,
                    retry_delay,
                    str(e),
                )
                await asyncio.sleep(retry_delay)
        assert result is not None
        return result

    res = event_loop.run_until_complete(create_application())

    def delete_application() -> None:
        async def fin() -> None:
            assert res.id is not None
            await azure_ad_ext_service_client.applications.by_application_id(res.id).delete()

        event_loop.run_until_complete(fin())

    request.addfinalizer(delete_application)  # noqa: PT021

    assert res.app_id is not None
    assert res.password_credentials is not None
    secret = res.password_credentials[-1].secret_text
    assert secret is not None
    return AzureAuthTestSet(client_id=res.app_id, secret=secret)
