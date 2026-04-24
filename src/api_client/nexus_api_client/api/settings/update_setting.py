from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.runtime_setting_read import RuntimeSettingRead
from ...models.setting_update import SettingUpdate
from ...types import Response


def _get_kwargs(
    key: str,
    *,
    body: SettingUpdate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "patch",
        "url": f"/settings/{key}",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | RuntimeSettingRead | None:
    if response.status_code == 200:
        response_200 = RuntimeSettingRead.from_dict(response.json())

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

    if response.status_code == 500:
        response_500 = ErrorData.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ErrorData | RuntimeSettingRead]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    key: str,
    *,
    client: AuthenticatedClient,
    body: SettingUpdate,
) -> Response[ErrorData | RuntimeSettingRead]:
    """Update Setting

     Update a runtime setting value with optimistic locking.

    Args:
        key (str):
        body (SettingUpdate): Request body for PATCH /settings/{key}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | RuntimeSettingRead]
    """

    kwargs = _get_kwargs(
        key=key,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    key: str,
    *,
    client: AuthenticatedClient,
    body: SettingUpdate,
) -> ErrorData | RuntimeSettingRead | None:
    """Update Setting

     Update a runtime setting value with optimistic locking.

    Args:
        key (str):
        body (SettingUpdate): Request body for PATCH /settings/{key}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | RuntimeSettingRead
    """

    return sync_detailed(
        key=key,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    key: str,
    *,
    client: AuthenticatedClient,
    body: SettingUpdate,
) -> Response[ErrorData | RuntimeSettingRead]:
    """Update Setting

     Update a runtime setting value with optimistic locking.

    Args:
        key (str):
        body (SettingUpdate): Request body for PATCH /settings/{key}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | RuntimeSettingRead]
    """

    kwargs = _get_kwargs(
        key=key,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    key: str,
    *,
    client: AuthenticatedClient,
    body: SettingUpdate,
) -> ErrorData | RuntimeSettingRead | None:
    """Update Setting

     Update a runtime setting value with optimistic locking.

    Args:
        key (str):
        body (SettingUpdate): Request body for PATCH /settings/{key}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | RuntimeSettingRead
    """

    return (
        await asyncio_detailed(
            key=key,
            client=client,
            body=body,
        )
    ).parsed
