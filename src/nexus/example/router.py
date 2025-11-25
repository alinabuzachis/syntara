"""Example API endpoints."""

from fastapi import APIRouter

from nexus.example.models import (
    CreateExampleRequest,
    DeleteResponse,
    ExampleItem,
    ExampleListResponse,
    ExampleStatus,
    UpdateExampleRequest,
)

router = APIRouter()


@router.get("/example")
async def get_example(limit: int = 10) -> ExampleListResponse:
    """Get example data.

    Returns a list of example items for demonstration purposes.

    Args:
        limit: Maximum number of items to return (default: 10)

    Returns:
        Dictionary containing list of example items and total count

    """
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


@router.post("/example")
async def create_example(request: CreateExampleRequest) -> ExampleItem:
    """Create a new example item.

    Args:
        request: The example item to create

    Returns:
        The created example item

    """
    return ExampleItem(
        id=3,
        name=request.name,
        description=request.description,
        status=request.status,
        created_at="2025-11-10T12:00:00Z",
        updated_at="2025-11-10T12:00:00Z",
    )


@router.get("/example/{item_id}")
async def get_example_by_id(item_id: int) -> ExampleItem:
    """Get a single example item by ID.

    Args:
        item_id: Example item ID

    Returns:
        The example item with the specified ID

    """
    return ExampleItem(
        id=item_id,
        name=f"Example Item {item_id}",
        description=f"This is example item number {item_id}",
        status=ExampleStatus.ACTIVE,
        created_at="2025-11-10T10:00:00Z",
        updated_at="2025-11-10T10:00:00Z",
    )


@router.put("/example/{item_id}")
async def update_example(
    item_id: int,
    request: UpdateExampleRequest,
) -> ExampleItem:
    """Update an existing example item.

    Args:
        item_id: Example item ID
        request: The fields to update

    Returns:
        The updated example item

    """
    return ExampleItem(
        id=item_id,
        name=request.name or f"Example Item {item_id}",
        description=request.description or f"Updated description for item {item_id}",
        status=request.status or ExampleStatus.ACTIVE,
        created_at="2025-11-10T10:00:00Z",
        updated_at="2025-11-10T13:00:00Z",
    )


@router.delete("/example/{item_id}")
async def delete_example(item_id: int) -> DeleteResponse:
    """Delete an example item.

    Args:
        item_id: Example item ID

    Returns:
        Success message

    """
    return DeleteResponse(message=f"Example item {item_id} deleted successfully")
