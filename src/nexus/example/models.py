"""Pydantic models for example API endpoints."""

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ExampleStatus(str, Enum):
    """Status enumeration for example items."""

    ACTIVE = "active"
    INACTIVE = "inactive"


class ExampleItemBase(BaseModel):
    """Base schema with shared example item fields."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Name of the example item",
    )
    description: str | None = Field(
        None,
        max_length=500,
        description="Description of the example item",
    )
    status: ExampleStatus = Field(
        default=ExampleStatus.ACTIVE,
        description="Status of the example item",
    )


class CreateExampleRequest(ExampleItemBase):
    """Schema for creating a new example item (POST /example)."""


class UpdateExampleRequest(BaseModel):
    """Schema for updating an example item (PUT /example/{item_id})."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    status: ExampleStatus | None = None


class ExampleItem(ExampleItemBase):
    """Schema for example item response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: str  # ISO 8601 datetime string
    updated_at: str  # ISO 8601 datetime string


class ExampleListResponse(BaseModel):
    """Schema for GET /example response."""

    data: list[ExampleItem]
    total: int


class DeleteResponse(BaseModel):
    """Schema for DELETE response."""

    message: str
