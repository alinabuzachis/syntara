from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.audit_export_create import AuditExportCreate
from ...models.audit_export_read import AuditExportRead
from ...models.error_data import ErrorData
from ...types import Response, Unset


def _get_kwargs(
    *,
    body: AuditExportCreate | None | Unset,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/audit/exports",
    }

    if isinstance(body, AuditExportCreate):
        _kwargs["json"] = body.to_dict()
    else:
        _kwargs["json"] = body

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> AuditExportRead | ErrorData | None:
    if response.status_code == 202:
        response_202 = AuditExportRead.from_dict(response.json())

        return response_202

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

    if response.status_code == 500:
        response_500 = ErrorData.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[AuditExportRead | ErrorData]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: AuditExportCreate | None | Unset,
) -> Response[AuditExportRead | ErrorData]:
    """Start Audit Export

     Start an asynchronous audit event export.

    Returns immediately with an export ID that can be used to poll for
    status and download the result once complete.

    Args:
        body (AuditExportCreate | None | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[AuditExportRead | ErrorData]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    body: AuditExportCreate | None | Unset,
) -> AuditExportRead | ErrorData | None:
    """Start Audit Export

     Start an asynchronous audit event export.

    Returns immediately with an export ID that can be used to poll for
    status and download the result once complete.

    Args:
        body (AuditExportCreate | None | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        AuditExportRead | ErrorData
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: AuditExportCreate | None | Unset,
) -> Response[AuditExportRead | ErrorData]:
    """Start Audit Export

     Start an asynchronous audit event export.

    Returns immediately with an export ID that can be used to poll for
    status and download the result once complete.

    Args:
        body (AuditExportCreate | None | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[AuditExportRead | ErrorData]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: AuditExportCreate | None | Unset,
) -> AuditExportRead | ErrorData | None:
    """Start Audit Export

     Start an asynchronous audit event export.

    Returns immediately with an export ID that can be used to poll for
    status and download the result once complete.

    Args:
        body (AuditExportCreate | None | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        AuditExportRead | ErrorData
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
