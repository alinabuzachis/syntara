from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.metrics_category_type import MetricsCategoryType
from ...models.metrics_record_page import MetricsRecordPage
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    metric_type: None | str | Unset = UNSET,
    category: MetricsCategoryType | None | Unset = UNSET,
    labels: None | str | Unset = UNSET,
    limit: int | Unset = 1000,
    offset: int | Unset = 0,
    additional_params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if isinstance(additional_params, dict):
        params = additional_params

    json_metric_type: None | str | Unset
    if isinstance(metric_type, Unset):
        json_metric_type = UNSET
    else:
        json_metric_type = metric_type
    params["metric_type"] = json_metric_type

    json_category: None | str | Unset
    if isinstance(category, Unset):
        json_category = UNSET
    elif isinstance(category, MetricsCategoryType):
        json_category = category.value
    else:
        json_category = category
    params["category"] = json_category

    json_labels: None | str | Unset
    if isinstance(labels, Unset):
        json_labels = UNSET
    else:
        json_labels = labels
    params["labels"] = json_labels

    params["limit"] = limit

    params["offset"] = offset

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/_internal/metrics/records",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | MetricsRecordPage | None:
    if response.status_code == 200:
        response_200 = MetricsRecordPage.from_dict(response.json())

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
) -> Response[ErrorData | MetricsRecordPage]:
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
    metric_type: None | str | Unset = UNSET,
    category: MetricsCategoryType | None | Unset = UNSET,
    labels: None | str | Unset = UNSET,
    limit: int | Unset = 1000,
    offset: int | Unset = 0,
    additional_params: dict[str, Any] | None = None,
) -> Response[ErrorData | MetricsRecordPage]:
    """Metrics Store Records

     Return raw metric records with optional filtering and pagination.

    Args:
        metric_type (None | str | Unset): Filter by metric type value
        category (MetricsCategoryType | None | Unset): Filter by category
        labels (None | str | Unset): Label filter as JSON, e.g. {"component":"api_service"}
        limit (int | Unset): Page size Default: 1000.
        offset (int | Unset): Offset Default: 0.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | MetricsRecordPage]
    """

    kwargs = _get_kwargs(
        metric_type=metric_type,
        category=category,
        labels=labels,
        limit=limit,
        offset=offset,
        additional_params=additional_params,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
    metric_type: None | str | Unset = UNSET,
    category: MetricsCategoryType | None | Unset = UNSET,
    labels: None | str | Unset = UNSET,
    limit: int | Unset = 1000,
    offset: int | Unset = 0,
) -> ErrorData | MetricsRecordPage | None:
    """Metrics Store Records

     Return raw metric records with optional filtering and pagination.

    Args:
        metric_type (None | str | Unset): Filter by metric type value
        category (MetricsCategoryType | None | Unset): Filter by category
        labels (None | str | Unset): Label filter as JSON, e.g. {"component":"api_service"}
        limit (int | Unset): Page size Default: 1000.
        offset (int | Unset): Offset Default: 0.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | MetricsRecordPage
    """

    return sync_detailed(
        client=client,
        metric_type=metric_type,
        category=category,
        labels=labels,
        limit=limit,
        offset=offset,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    metric_type: None | str | Unset = UNSET,
    category: MetricsCategoryType | None | Unset = UNSET,
    labels: None | str | Unset = UNSET,
    limit: int | Unset = 1000,
    offset: int | Unset = 0,
) -> Response[ErrorData | MetricsRecordPage]:
    """Metrics Store Records

     Return raw metric records with optional filtering and pagination.

    Args:
        metric_type (None | str | Unset): Filter by metric type value
        category (MetricsCategoryType | None | Unset): Filter by category
        labels (None | str | Unset): Label filter as JSON, e.g. {"component":"api_service"}
        limit (int | Unset): Page size Default: 1000.
        offset (int | Unset): Offset Default: 0.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | MetricsRecordPage]
    """

    kwargs = _get_kwargs(
        metric_type=metric_type,
        category=category,
        labels=labels,
        limit=limit,
        offset=offset,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    metric_type: None | str | Unset = UNSET,
    category: MetricsCategoryType | None | Unset = UNSET,
    labels: None | str | Unset = UNSET,
    limit: int | Unset = 1000,
    offset: int | Unset = 0,
) -> ErrorData | MetricsRecordPage | None:
    """Metrics Store Records

     Return raw metric records with optional filtering and pagination.

    Args:
        metric_type (None | str | Unset): Filter by metric type value
        category (MetricsCategoryType | None | Unset): Filter by category
        labels (None | str | Unset): Label filter as JSON, e.g. {"component":"api_service"}
        limit (int | Unset): Page size Default: 1000.
        offset (int | Unset): Offset Default: 0.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | MetricsRecordPage
    """

    return (
        await asyncio_detailed(
            client=client,
            metric_type=metric_type,
            category=category,
            labels=labels,
            limit=limit,
            offset=offset,
        )
    ).parsed
