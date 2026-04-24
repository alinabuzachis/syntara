from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.validate_name_resource_type import ValidateNameResourceType
from ...models.validate_name_response import ValidateNameResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    name: str,
    resource_type: ValidateNameResourceType | Unset = ValidateNameResourceType.PROJECT,
    additional_params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if isinstance(additional_params, dict):
        params = additional_params

    params["name"] = name

    json_resource_type: str | Unset = UNSET
    if not isinstance(resource_type, Unset):
        json_resource_type = resource_type.value

    params["resource_type"] = json_resource_type

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/authz/validate-name",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | ValidateNameResponse | None:
    if response.status_code == 200:
        response_200 = ValidateNameResponse.from_dict(response.json())

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
) -> Response[ErrorData | ValidateNameResponse]:
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
    client: AuthenticatedClient | Client,
    name: str,
    resource_type: ValidateNameResourceType | Unset = ValidateNameResourceType.PROJECT,
    additional_params: dict[str, Any] | None = None,
) -> Response[ErrorData | ValidateNameResponse]:
    """Validate Name

     Validate a resource name against naming rules.
    Returns whether the name is valid and, if not, why.
    Intended for real-time UI validation.

    Args:
        name (str): Name to validate
        resource_type (ValidateNameResourceType | Unset): Resource type Default:
            ValidateNameResourceType.PROJECT.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ValidateNameResponse]
    """

    kwargs = _get_kwargs(name=name, resource_type=resource_type, additional_params=additional_params)

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
    name: str,
    resource_type: ValidateNameResourceType | Unset = ValidateNameResourceType.PROJECT,
) -> ErrorData | ValidateNameResponse | None:
    """Validate Name

     Validate a resource name against naming rules.
    Returns whether the name is valid and, if not, why.
    Intended for real-time UI validation.

    Args:
        name (str): Name to validate
        resource_type (ValidateNameResourceType | Unset): Resource type Default:
            ValidateNameResourceType.PROJECT.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ValidateNameResponse
    """

    return sync_detailed(
        client=client,
        name=name,
        resource_type=resource_type,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    name: str,
    resource_type: ValidateNameResourceType | Unset = ValidateNameResourceType.PROJECT,
) -> Response[ErrorData | ValidateNameResponse]:
    """Validate Name

     Validate a resource name against naming rules.
    Returns whether the name is valid and, if not, why.
    Intended for real-time UI validation.

    Args:
        name (str): Name to validate
        resource_type (ValidateNameResourceType | Unset): Resource type Default:
            ValidateNameResourceType.PROJECT.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ValidateNameResponse]
    """

    kwargs = _get_kwargs(
        name=name,
        resource_type=resource_type,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    name: str,
    resource_type: ValidateNameResourceType | Unset = ValidateNameResourceType.PROJECT,
) -> ErrorData | ValidateNameResponse | None:
    """Validate Name

     Validate a resource name against naming rules.
    Returns whether the name is valid and, if not, why.
    Intended for real-time UI validation.

    Args:
        name (str): Name to validate
        resource_type (ValidateNameResourceType | Unset): Resource type Default:
            ValidateNameResourceType.PROJECT.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ValidateNameResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            name=name,
            resource_type=resource_type,
        )
    ).parsed
