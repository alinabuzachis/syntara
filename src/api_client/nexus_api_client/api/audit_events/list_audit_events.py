from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.actor_type import ActorType
from ...models.audit_event_list_response import AuditEventListResponse
from ...models.error_data import ErrorData
from ...models.event_category import EventCategory
from ...models.event_severity import EventSeverity
from ...models.event_status import EventStatus
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    event_category: EventCategory | None | Unset = UNSET,
    event_severity: EventSeverity | None | Unset = UNSET,
    event_status: EventStatus | None | Unset = UNSET,
    event_action: None | str | Unset = UNSET,
    actor_id: None | Unset | UUID = UNSET,
    actor_type: ActorType | None | Unset = UNSET,
    actor_username: None | str | Unset = UNSET,
    source_component: None | str | Unset = UNSET,
    resource_urn: None | str | Unset = UNSET,
    resource_name: None | str | Unset = UNSET,
    workflow_id: None | Unset | UUID = UNSET,
    activity_id: None | str | Unset = UNSET,
    execution_id: None | Unset | UUID = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if isinstance(additional_params, dict):
        params = additional_params

    params["limit"] = limit

    json_cursor: None | str | Unset
    if isinstance(cursor, Unset):
        json_cursor = UNSET
    else:
        json_cursor = cursor
    params["cursor"] = json_cursor

    json_sort: None | str | Unset
    if isinstance(sort, Unset):
        json_sort = UNSET
    else:
        json_sort = sort
    params["sort"] = json_sort

    params["include_total"] = include_total

    json_event_category: None | str | Unset
    if isinstance(event_category, Unset):
        json_event_category = UNSET
    elif isinstance(event_category, EventCategory):
        json_event_category = event_category.value
    else:
        json_event_category = event_category
    params["event_category"] = json_event_category

    json_event_severity: None | str | Unset
    if isinstance(event_severity, Unset):
        json_event_severity = UNSET
    elif isinstance(event_severity, EventSeverity):
        json_event_severity = event_severity.value
    else:
        json_event_severity = event_severity
    params["event_severity"] = json_event_severity

    json_event_status: None | str | Unset
    if isinstance(event_status, Unset):
        json_event_status = UNSET
    elif isinstance(event_status, EventStatus):
        json_event_status = event_status.value
    else:
        json_event_status = event_status
    params["event_status"] = json_event_status

    json_event_action: None | str | Unset
    if isinstance(event_action, Unset):
        json_event_action = UNSET
    else:
        json_event_action = event_action
    params["event_action"] = json_event_action

    json_actor_id: None | str | Unset
    if isinstance(actor_id, Unset):
        json_actor_id = UNSET
    elif isinstance(actor_id, UUID):
        json_actor_id = str(actor_id)
    else:
        json_actor_id = actor_id
    params["actor_id"] = json_actor_id

    json_actor_type: None | str | Unset
    if isinstance(actor_type, Unset):
        json_actor_type = UNSET
    elif isinstance(actor_type, ActorType):
        json_actor_type = actor_type.value
    else:
        json_actor_type = actor_type
    params["actor_type"] = json_actor_type

    json_actor_username: None | str | Unset
    if isinstance(actor_username, Unset):
        json_actor_username = UNSET
    else:
        json_actor_username = actor_username
    params["actor_username"] = json_actor_username

    json_source_component: None | str | Unset
    if isinstance(source_component, Unset):
        json_source_component = UNSET
    else:
        json_source_component = source_component
    params["source_component"] = json_source_component

    json_resource_urn: None | str | Unset
    if isinstance(resource_urn, Unset):
        json_resource_urn = UNSET
    else:
        json_resource_urn = resource_urn
    params["resource_urn"] = json_resource_urn

    json_resource_name: None | str | Unset
    if isinstance(resource_name, Unset):
        json_resource_name = UNSET
    else:
        json_resource_name = resource_name
    params["resource_name"] = json_resource_name

    json_workflow_id: None | str | Unset
    if isinstance(workflow_id, Unset):
        json_workflow_id = UNSET
    elif isinstance(workflow_id, UUID):
        json_workflow_id = str(workflow_id)
    else:
        json_workflow_id = workflow_id
    params["workflow_id"] = json_workflow_id

    json_activity_id: None | str | Unset
    if isinstance(activity_id, Unset):
        json_activity_id = UNSET
    else:
        json_activity_id = activity_id
    params["activity_id"] = json_activity_id

    json_execution_id: None | str | Unset
    if isinstance(execution_id, Unset):
        json_execution_id = UNSET
    elif isinstance(execution_id, UUID):
        json_execution_id = str(execution_id)
    else:
        json_execution_id = execution_id
    params["execution_id"] = json_execution_id

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/audit",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> AuditEventListResponse | ErrorData | None:
    if response.status_code == 200:
        response_200 = AuditEventListResponse.from_dict(response.json())

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
) -> Response[AuditEventListResponse | ErrorData]:
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
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    event_category: EventCategory | None | Unset = UNSET,
    event_severity: EventSeverity | None | Unset = UNSET,
    event_status: EventStatus | None | Unset = UNSET,
    event_action: None | str | Unset = UNSET,
    actor_id: None | Unset | UUID = UNSET,
    actor_type: ActorType | None | Unset = UNSET,
    actor_username: None | str | Unset = UNSET,
    source_component: None | str | Unset = UNSET,
    resource_urn: None | str | Unset = UNSET,
    resource_name: None | str | Unset = UNSET,
    workflow_id: None | Unset | UUID = UNSET,
    activity_id: None | str | Unset = UNSET,
    execution_id: None | Unset | UUID = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> Response[AuditEventListResponse | ErrorData]:
    """List Audit Events

     Retrieve a paginated list of audit events with optional filtering.

    Use this endpoint to:
    - Review system activity for a specific actor
    - Trace operations within a workflow or execution
    - Investigate events within a date range
    - Filter by actor type (user, system, service)

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        event_category (EventCategory | None | Unset): Filter by event category
        event_severity (EventSeverity | None | Unset): Filter by event severity level
        event_status (EventStatus | None | Unset): Filter by event status
        event_action (None | str | Unset): Filter by specific action
        actor_id (None | Unset | UUID): Filter by actor UUID
        actor_type (ActorType | None | Unset): Filter by actor type
        actor_username (None | str | Unset): Filter by actor username
        source_component (None | str | Unset): Filter by source component
        resource_urn (None | str | Unset): Filter by resource URN
        resource_name (None | str | Unset): Filter by resource name
        workflow_id (None | Unset | UUID): Filter by workflow UUID
        activity_id (None | str | Unset): Filter by activity identifier
        execution_id (None | Unset | UUID): Filter by execution UUID

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[AuditEventListResponse | ErrorData]
    """

    kwargs = _get_kwargs(
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        event_category=event_category,
        event_severity=event_severity,
        event_status=event_status,
        event_action=event_action,
        actor_id=actor_id,
        actor_type=actor_type,
        actor_username=actor_username,
        source_component=source_component,
        resource_urn=resource_urn,
        resource_name=resource_name,
        workflow_id=workflow_id,
        activity_id=activity_id,
        execution_id=execution_id,
        additional_params=additional_params,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    event_category: EventCategory | None | Unset = UNSET,
    event_severity: EventSeverity | None | Unset = UNSET,
    event_status: EventStatus | None | Unset = UNSET,
    event_action: None | str | Unset = UNSET,
    actor_id: None | Unset | UUID = UNSET,
    actor_type: ActorType | None | Unset = UNSET,
    actor_username: None | str | Unset = UNSET,
    source_component: None | str | Unset = UNSET,
    resource_urn: None | str | Unset = UNSET,
    resource_name: None | str | Unset = UNSET,
    workflow_id: None | Unset | UUID = UNSET,
    activity_id: None | str | Unset = UNSET,
    execution_id: None | Unset | UUID = UNSET,
) -> AuditEventListResponse | ErrorData | None:
    """List Audit Events

     Retrieve a paginated list of audit events with optional filtering.

    Use this endpoint to:
    - Review system activity for a specific actor
    - Trace operations within a workflow or execution
    - Investigate events within a date range
    - Filter by actor type (user, system, service)

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        event_category (EventCategory | None | Unset): Filter by event category
        event_severity (EventSeverity | None | Unset): Filter by event severity level
        event_status (EventStatus | None | Unset): Filter by event status
        event_action (None | str | Unset): Filter by specific action
        actor_id (None | Unset | UUID): Filter by actor UUID
        actor_type (ActorType | None | Unset): Filter by actor type
        actor_username (None | str | Unset): Filter by actor username
        source_component (None | str | Unset): Filter by source component
        resource_urn (None | str | Unset): Filter by resource URN
        resource_name (None | str | Unset): Filter by resource name
        workflow_id (None | Unset | UUID): Filter by workflow UUID
        activity_id (None | str | Unset): Filter by activity identifier
        execution_id (None | Unset | UUID): Filter by execution UUID

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        AuditEventListResponse | ErrorData
    """

    return sync_detailed(
        client=client,
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        event_category=event_category,
        event_severity=event_severity,
        event_status=event_status,
        event_action=event_action,
        actor_id=actor_id,
        actor_type=actor_type,
        actor_username=actor_username,
        source_component=source_component,
        resource_urn=resource_urn,
        resource_name=resource_name,
        workflow_id=workflow_id,
        activity_id=activity_id,
        execution_id=execution_id,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    event_category: EventCategory | None | Unset = UNSET,
    event_severity: EventSeverity | None | Unset = UNSET,
    event_status: EventStatus | None | Unset = UNSET,
    event_action: None | str | Unset = UNSET,
    actor_id: None | Unset | UUID = UNSET,
    actor_type: ActorType | None | Unset = UNSET,
    actor_username: None | str | Unset = UNSET,
    source_component: None | str | Unset = UNSET,
    resource_urn: None | str | Unset = UNSET,
    resource_name: None | str | Unset = UNSET,
    workflow_id: None | Unset | UUID = UNSET,
    activity_id: None | str | Unset = UNSET,
    execution_id: None | Unset | UUID = UNSET,
) -> Response[AuditEventListResponse | ErrorData]:
    """List Audit Events

     Retrieve a paginated list of audit events with optional filtering.

    Use this endpoint to:
    - Review system activity for a specific actor
    - Trace operations within a workflow or execution
    - Investigate events within a date range
    - Filter by actor type (user, system, service)

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        event_category (EventCategory | None | Unset): Filter by event category
        event_severity (EventSeverity | None | Unset): Filter by event severity level
        event_status (EventStatus | None | Unset): Filter by event status
        event_action (None | str | Unset): Filter by specific action
        actor_id (None | Unset | UUID): Filter by actor UUID
        actor_type (ActorType | None | Unset): Filter by actor type
        actor_username (None | str | Unset): Filter by actor username
        source_component (None | str | Unset): Filter by source component
        resource_urn (None | str | Unset): Filter by resource URN
        resource_name (None | str | Unset): Filter by resource name
        workflow_id (None | Unset | UUID): Filter by workflow UUID
        activity_id (None | str | Unset): Filter by activity identifier
        execution_id (None | Unset | UUID): Filter by execution UUID

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[AuditEventListResponse | ErrorData]
    """

    kwargs = _get_kwargs(
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        event_category=event_category,
        event_severity=event_severity,
        event_status=event_status,
        event_action=event_action,
        actor_id=actor_id,
        actor_type=actor_type,
        actor_username=actor_username,
        source_component=source_component,
        resource_urn=resource_urn,
        resource_name=resource_name,
        workflow_id=workflow_id,
        activity_id=activity_id,
        execution_id=execution_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    event_category: EventCategory | None | Unset = UNSET,
    event_severity: EventSeverity | None | Unset = UNSET,
    event_status: EventStatus | None | Unset = UNSET,
    event_action: None | str | Unset = UNSET,
    actor_id: None | Unset | UUID = UNSET,
    actor_type: ActorType | None | Unset = UNSET,
    actor_username: None | str | Unset = UNSET,
    source_component: None | str | Unset = UNSET,
    resource_urn: None | str | Unset = UNSET,
    resource_name: None | str | Unset = UNSET,
    workflow_id: None | Unset | UUID = UNSET,
    activity_id: None | str | Unset = UNSET,
    execution_id: None | Unset | UUID = UNSET,
) -> AuditEventListResponse | ErrorData | None:
    """List Audit Events

     Retrieve a paginated list of audit events with optional filtering.

    Use this endpoint to:
    - Review system activity for a specific actor
    - Trace operations within a workflow or execution
    - Investigate events within a date range
    - Filter by actor type (user, system, service)

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        event_category (EventCategory | None | Unset): Filter by event category
        event_severity (EventSeverity | None | Unset): Filter by event severity level
        event_status (EventStatus | None | Unset): Filter by event status
        event_action (None | str | Unset): Filter by specific action
        actor_id (None | Unset | UUID): Filter by actor UUID
        actor_type (ActorType | None | Unset): Filter by actor type
        actor_username (None | str | Unset): Filter by actor username
        source_component (None | str | Unset): Filter by source component
        resource_urn (None | str | Unset): Filter by resource URN
        resource_name (None | str | Unset): Filter by resource name
        workflow_id (None | Unset | UUID): Filter by workflow UUID
        activity_id (None | str | Unset): Filter by activity identifier
        execution_id (None | Unset | UUID): Filter by execution UUID

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        AuditEventListResponse | ErrorData
    """

    return (
        await asyncio_detailed(
            client=client,
            limit=limit,
            cursor=cursor,
            sort=sort,
            include_total=include_total,
            event_category=event_category,
            event_severity=event_severity,
            event_status=event_status,
            event_action=event_action,
            actor_id=actor_id,
            actor_type=actor_type,
            actor_username=actor_username,
            source_component=source_component,
            resource_urn=resource_urn,
            resource_name=resource_name,
            workflow_id=workflow_id,
            activity_id=activity_id,
            execution_id=execution_id,
        )
    ).parsed
