from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.component_kpi_summary import ComponentKPISummary
from ...models.error_data import ErrorData
from ...types import Response


def _get_kwargs(
    component: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": f"/_internal/metrics/kpis/{component}",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ComponentKPISummary | ErrorData | None:
    if response.status_code == 200:
        response_200 = ComponentKPISummary.from_dict(response.json())

        return response_200

    if response.status_code == 400:
        response_400 = ErrorData.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = ErrorData.from_dict(response.json())

        return response_401

    if response.status_code == 403:
        response_403 = ErrorData.from_dict(response.json())

        return response_403

    if response.status_code == 404:
        response_404 = ErrorData.from_dict(response.json())

        return response_404

    if response.status_code == 409:
        response_409 = ErrorData.from_dict(response.json())

        return response_409

    if response.status_code == 422:
        response_422 = ErrorData.from_dict(response.json())

        return response_422

    if response.status_code == 429:
        response_429 = ErrorData.from_dict(response.json())

        return response_429

    if response.status_code == 500:
        response_500 = ErrorData.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ComponentKPISummary | ErrorData]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    component: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[ComponentKPISummary | ErrorData]:
    """Metrics Store Component Kpis

     Return KPIs for a single component.

    Args:
        component (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ComponentKPISummary | ErrorData]
    """

    kwargs = _get_kwargs(
        component=component,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    component: str,
    *,
    client: AuthenticatedClient | Client,
) -> ComponentKPISummary | ErrorData | None:
    """Metrics Store Component Kpis

     Return KPIs for a single component.

    Args:
        component (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ComponentKPISummary | ErrorData
    """

    return sync_detailed(
        component=component,
        client=client,
    ).parsed


async def asyncio_detailed(
    component: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[ComponentKPISummary | ErrorData]:
    """Metrics Store Component Kpis

     Return KPIs for a single component.

    Args:
        component (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ComponentKPISummary | ErrorData]
    """

    kwargs = _get_kwargs(
        component=component,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    component: str,
    *,
    client: AuthenticatedClient | Client,
) -> ComponentKPISummary | ErrorData | None:
    """Metrics Store Component Kpis

     Return KPIs for a single component.

    Args:
        component (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ComponentKPISummary | ErrorData
    """

    return (
        await asyncio_detailed(
            component=component,
            client=client,
        )
    ).parsed
