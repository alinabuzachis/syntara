"""Example API endpoints."""

from typing import Annotated

from fastapi import APIRouter, Path, Query

from nexus.example.models import (
    CreateExampleRequest,
    DeleteResponse,
    ExampleItem,
    ExampleListResponse,
    ExampleStatus,
    UpdateExampleRequest,
)

router = APIRouter(tags=["example"])


@router.get(
    "/example",
    summary="Get example data",
    description="Returns example data for demonstration purposes",
    operation_id="get_example",
    response_description="Successful Response",
)
async def get_example(
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum number of items to return")] = 10,
) -> ExampleListResponse:
    """Return example data for demonstration purposes."""
    return ExampleListResponse(
        data=[
            ExampleItem(
                id=1,
                name="Example Item 1",
                description="This is the first example item",
                status=ExampleStatus.ACTIVE,
                created_at="2025-11-10T10:00:00Z",
                updated_at="2025-11-10T10:00:00Z",
            ),
            ExampleItem(
                id=2,
                name="Example Item 2",
                description="This is the second example item",
                status=ExampleStatus.ACTIVE,
                created_at="2025-11-10T11:00:00Z",
                updated_at="2025-11-10T11:00:00Z",
            ),
        ][:limit],
        total=2,
    )


@router.post(
    "/example",
    summary="Create example item",
    description="Creates a new example item",
    operation_id="create_example",
    status_code=201,
    response_description="Item created successfully",
)
async def create_example(request: CreateExampleRequest) -> ExampleItem:
    """Create a new example item."""
    return ExampleItem(
        id=3,
        name=request.name,
        description=request.description,
        status=request.status,
        created_at="2025-11-10T12:00:00Z",
        updated_at="2025-11-10T12:00:00Z",
    )


@router.get(
    "/example/{item_id}",
    summary="Get example item by ID",
    description="Returns a single example item by its ID",
    operation_id="get_example_by_id",
    response_description="Successful Response",
)
async def get_example_by_id(
    item_id: Annotated[int, Path(description="Example item ID")],
) -> ExampleItem:
    """Return a single example item by its ID."""
    return ExampleItem(
        id=item_id,
        name=f"Example Item {item_id}",
        description=f"This is example item number {item_id}",
        status=ExampleStatus.ACTIVE,
        created_at="2025-11-10T10:00:00Z",
        updated_at="2025-11-10T10:00:00Z",
    )


@router.put(
    "/example/{item_id}",
    summary="Update example item",
    description="Updates an existing example item",
    operation_id="update_example",
    response_description="Item updated successfully",
)
async def update_example(
    request: UpdateExampleRequest,
    item_id: Annotated[int, Path(description="Example item ID")],
) -> ExampleItem:
    """Update an existing example item."""
    return ExampleItem(
        id=item_id,
        name=request.name or f"Example Item {item_id}",
        description=request.description or f"Updated description for item {item_id}",
        status=request.status or ExampleStatus.ACTIVE,
        created_at="2025-11-10T10:00:00Z",
        updated_at="2025-11-10T13:00:00Z",
    )


@router.delete(
    "/example/{item_id}",
    summary="Delete example item",
    description="Deletes an example item",
    operation_id="delete_example",
    response_description="Successful Response",
)
async def delete_example(
    item_id: Annotated[int, Path(description="Example item ID")],
) -> DeleteResponse:
    """Delete an example item."""
    return DeleteResponse(message=f"Example item {item_id} deleted successfully")
