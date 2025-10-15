# Quickstart: Shared API Resources

**Feature**: 006-create-shared-resources
**Date**: 2025-10-09

## Overview

This quickstart guide demonstrates how to validate and use the shared library including Open API schemas, Pydantic models, and utility functions. Test scenarios cover the complete acceptance criteria from the feature specification.

## Prerequisites

- Python 3.12+
- pytest, pyyaml, pydantic 2.x

```bash
pip install pytest pyyaml pydantic
```

## Test Scenarios

### Part 1: OpenAPI Schema Validation

#### Scenario 1: Validate Base Schema Structure

**Goal**: Verify BaseResource schema with labels as key-value pairs

**Test Code**:
```python
import yaml

def test_base_resource_schema():
    """Verify BaseResource schema structure"""
    with open('specs/006-create-shared-resources/contracts/shared-resources.openapi.yaml') as f:
        spec = yaml.safe_load(f)

    schemas = spec['components']['schemas']
    base = schemas['BaseResource']

    # Required fields
    assert 'id' in base['properties']
    assert 'createdAt' in base['properties']
    assert 'updatedAt' in base['properties']
    assert 'labels' in base['properties']

    # Field types and constraints
    assert base['properties']['id']['format'] == 'uuid'
    assert base['properties']['id']['readOnly'] is True
    assert base['properties']['createdAt']['format'] == 'date-time'
    assert base['properties']['createdAt']['readOnly'] is True

    # Labels as key-value pairs (object with additionalProperties)
    labels_prop = base['properties']['labels']
    assert labels_prop['type'] == 'object'
    assert labels_prop.get('nullable') is True
    assert 'additionalProperties' in labels_prop
    assert labels_prop['additionalProperties']['type'] == 'string'
```

---

#### Scenario 2: Validate Schema Composition

**Goal**: Verify schemas properly use allOf for composition

**Test Code**:
```python
def test_schema_composition():
    """Verify schema composition via allOf"""
    with open('specs/006-create-shared-resources/contracts/shared-resources.openapi.yaml') as f:
        spec = yaml.safe_load(f)

    schemas = spec['components']['schemas']

    # NamedResource extends BaseResource
    named = schemas['NamedResource']
    assert 'allOf' in named
    assert any('$ref' in item and 'BaseResource' in item['$ref'] for item in named['allOf'])

    # Resource composes all three extensions
    resource = schemas['Resource']
    assert 'allOf' in resource
    refs = [item['$ref'] for item in resource['allOf'] if '$ref' in item]
    assert any('NamedResource' in ref for ref in refs)
    assert any('SoftDeletableResource' in ref for ref in refs)
    assert any('UserOwnedResource' in ref for ref in refs)
```

---

#### Scenario 3: Validate Label Filter Parameter

**Goal**: Verify labelsFilterParam supports deep object notation

**Test Code**:
```python
def test_labels_filter_parameter():
    """Verify label filter parameter definition"""
    with open('specs/006-create-shared-resources/contracts/shared-resources.openapi.yaml') as f:
        spec = yaml.safe_load(f)

    params = spec['components']['parameters']
    labels_param = params['labelsFilterParam']

    assert labels_param['name'] == 'labels'
    assert labels_param['in'] == 'query'
    assert labels_param['style'] == 'deepObject'
    assert labels_param['explode'] is True
    assert labels_param['schema']['type'] == 'object'
    assert 'additionalProperties' in labels_param['schema']
```

---

### Part 2: Pydantic Model Validation

#### Scenario 4: Validate BaseResource Pydantic Model

**Goal**: Test Pydantic model with labels as Dict[str, str]

**Test Code**:
```python
from pydantic import BaseModel, Field, ValidationError
from typing import Optional, Dict
from datetime import datetime
from uuid import UUID, uuid4
import pytest

class BaseResource(BaseModel):
    id: UUID = Field(..., exclude=True)
    created_at: datetime = Field(..., alias="createdAt", exclude=True)
    updated_at: datetime = Field(..., alias="updatedAt", exclude=True)
    labels: Optional[Dict[str, str]] = None

def test_base_resource_model():
    """Test BaseResource Pydantic model"""
    # Valid instance
    resource = BaseResource(
        id=uuid4(),
        created_at=datetime.now(),
        updated_at=datetime.now(),
        labels={"environment": "production", "region": "us-east-1"}
    )

    assert isinstance(resource.id, UUID)
    assert isinstance(resource.labels, dict)
    assert resource.labels["environment"] == "production"

    # Model dump excludes readOnly fields
    data = resource.model_dump(mode='json')
    assert 'id' not in data
    assert 'created_at' not in data
    assert 'labels' in data

    # Validate labels must be Dict[str, str]
    with pytest.raises(ValidationError):
        BaseResource(
            id=uuid4(),
            created_at=datetime.now(),
            updated_at=datetime.now(),
            labels={"key": 123}  # Invalid: value must be string
        )
```

---

#### Scenario 5: Validate Model Inheritance

**Goal**: Test that Resource inherits all parent fields

**Test Code**:
```python
class NamedResource(BaseResource):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)

class SoftDeletableResource(BaseResource):
    deleted_at: Optional[datetime] = Field(None, alias="deletedAt", exclude=True)
    deleted_by: Optional[UUID] = Field(None, alias="deletedBy", exclude=True)

class UserOwnedResource(BaseResource):
    created_by: UUID = Field(..., alias="createdBy", exclude=True)
    updated_by: Optional[UUID] = Field(None, alias="updatedBy", exclude=True)

class Resource(NamedResource, SoftDeletableResource, UserOwnedResource):
    pass

def test_resource_inheritance():
    """Test Resource inherits all parent fields"""
    resource = Resource(
        id=uuid4(),
        created_at=datetime.now(),
        updated_at=datetime.now(),
        labels={"environment": "production"},
        name="Test Resource",
        description="Test description",
        deleted_at=None,
        deleted_by=None,
        created_by=uuid4(),
        updated_by=None
    )

    # Has BaseResource fields
    assert hasattr(resource, 'id')
    assert hasattr(resource, 'labels')

    # Has NamedResource fields
    assert resource.name == "Test Resource"

    # Has SoftDeletableResource fields
    assert hasattr(resource, 'deleted_at')

    # Has UserOwnedResource fields
    assert hasattr(resource, 'created_by')
```

---

### Part 3: Utility Function Validation

#### Scenario 6: Validate Filter Parser

**Goal**: Test FilterParser handles bracket notation

**Test Code**:
```python
from dataclasses import dataclass
from enum import Enum
from typing import Any

class FilterOperator(str, Enum):
    EQ = "eq"
    CONTAINS = "contains"
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"

@dataclass
class Filter:
    field: str
    operator: FilterOperator
    value: Any

class FilterParser:
    @staticmethod
    def parse(params: Dict[str, str], allowed_fields: list[str]) -> list[Filter]:
        import re
        filters = []

        for param, value in params.items():
            # Match field[operator]=value
            match = re.match(r"(\w+)\[(\w+)\]", param)
            if match:
                field, operator = match.groups()
                if field not in allowed_fields:
                    raise ValueError(f"Invalid field: {field}")
                if operator not in FilterOperator.__members__.values():
                    raise ValueError(f"Invalid operator: {operator}")
                filters.append(Filter(field, FilterOperator(operator), value))
            else:
                # Shorthand equality
                if param not in allowed_fields:
                    raise ValueError(f"Invalid field: {param}")
                filters.append(Filter(param, FilterOperator.EQ, value))

        return filters

def test_filter_parser():
    """Test filter parsing with bracket notation"""
    # Test bracket notation
    filters = FilterParser.parse(
        {"name[contains]": "auth", "status": "active"},
        allowed_fields=["name", "status"]
    )

    assert len(filters) == 2
    assert filters[0].field == "name"
    assert filters[0].operator == FilterOperator.CONTAINS
    assert filters[0].value == "auth"

    # Test shorthand equality
    assert filters[1].field == "status"
    assert filters[1].operator == FilterOperator.EQ

    # Test invalid field raises error
    with pytest.raises(ValueError, match="Invalid field"):
        FilterParser.parse({"invalid": "value"}, allowed_fields=["name"])

    # Test invalid operator raises error
    with pytest.raises(ValueError, match="Invalid operator"):
        FilterParser.parse({"name[invalid]": "value"}, allowed_fields=["name"])
```

---

#### Scenario 7: Validate Label Filter

**Goal**: Test LabelFilter matches key-value pairs

**Test Code**:
```python
class LabelFilter:
    @staticmethod
    def matches(
        resource_labels: Optional[Dict[str, str]],
        filter_labels: Dict[str, str]
    ) -> bool:
        if not filter_labels:
            return True
        if not resource_labels:
            return False

        # All filter labels must exist in resource labels
        for key, value in filter_labels.items():
            if resource_labels.get(key) != value:
                return False
        return True

    @staticmethod
    def parse_label_filter(params: Dict[str, str]) -> Dict[str, str]:
        import re
        labels = {}
        for param, value in params.items():
            match = re.match(r"labels\[(\w+)\]", param)
            if match:
                key = match.group(1)
                labels[key] = value
        return labels

def test_label_filter():
    """Test label filtering logic"""
    # Matches when all filter labels present
    assert LabelFilter.matches(
        resource_labels={"environment": "production", "region": "us-east-1"},
        filter_labels={"environment": "production"}
    )

    # Does not match when filter label missing
    assert not LabelFilter.matches(
        resource_labels={"environment": "staging"},
        filter_labels={"environment": "production"}
    )

    # Matches when resource has additional labels
    assert LabelFilter.matches(
        resource_labels={"environment": "production", "region": "us-east-1", "team": "platform"},
        filter_labels={"environment": "production", "region": "us-east-1"}
    )

    # Test label filter parsing
    labels = LabelFilter.parse_label_filter({
        "labels[environment]": "production",
        "labels[region]": "us-east-1",
        "other_param": "ignored"
    })
    assert labels == {"environment": "production", "region": "us-east-1"}
```

---

#### Scenario 8: Validate Pagination Helper

**Goal**: Test pagination helper generates cursor links

**Test Code**:
```python
import base64
import json

class PaginationHelper:
    @staticmethod
    def encode_cursor(last_item: Any) -> str:
        cursor_data = {"id": str(last_item.id)}
        return base64.b64encode(json.dumps(cursor_data).encode()).decode()

    @staticmethod
    def decode_cursor(cursor: str) -> dict:
        return json.loads(base64.b64decode(cursor.encode()).decode())

    @staticmethod
    def generate_response(
        items: list,
        limit: int,
        cursor: Optional[str],
        base_url: str,
        include_total: bool = False,
        total_count: Optional[int] = None
    ) -> dict:
        response = {}

        # Generate next link if more items available
        if len(items) >= limit:
            next_cursor = PaginationHelper.encode_cursor(items[-1])
            response["next"] = f"{base_url}?cursor={next_cursor}&limit={limit}"
        else:
            response["next"] = None

        # Generate prev link if cursor provided
        if cursor:
            response["prev"] = f"{base_url}?limit={limit}"
        else:
            response["prev"] = None

        # Include total if requested
        if include_total:
            response["total"] = total_count

        return response

def test_pagination_helper():
    """Test pagination helper"""
    # Mock resources
    from types import SimpleNamespace
    resources = [SimpleNamespace(id=uuid4()) for _ in range(20)]

    # Generate pagination response
    response = PaginationHelper.generate_response(
        items=resources,
        limit=20,
        cursor=None,
        base_url="https://api.example.com/resources",
        include_total=True,
        total_count=100
    )

    assert response["total"] == 100
    assert response["prev"] is None
    assert "cursor=" in response["next"]

    # Test cursor encoding/decoding
    cursor = PaginationHelper.encode_cursor(resources[0])
    decoded = PaginationHelper.decode_cursor(cursor)
    assert "id" in decoded
```

---

#### Scenario 9: Validate Sort Parser

**Goal**: Test sort parser handles ±field syntax

**Test Code**:
```python
class SortDirection(str, Enum):
    ASC = "asc"
    DESC = "desc"

class SortParser:
    @staticmethod
    def parse(
        sort_param: Optional[str],
        allowed_fields: list[str],
        default_field: str = "created_at",
        default_direction: SortDirection = SortDirection.DESC
    ) -> tuple[str, SortDirection]:
        if not sort_param:
            return (default_field, default_direction)

        if sort_param.startswith("-"):
            field = sort_param[1:]
            direction = SortDirection.DESC
        else:
            field = sort_param
            direction = SortDirection.ASC

        if field not in allowed_fields:
            raise ValueError(f"Invalid field: {field}")

        return (field, direction)

def test_sort_parser():
    """Test sort parameter parsing"""
    # Ascending
    field, direction = SortParser.parse("name", allowed_fields=["name", "created_at"])
    assert field == "name"
    assert direction == SortDirection.ASC

    # Descending
    field, direction = SortParser.parse("-created_at", allowed_fields=["name", "created_at"])
    assert field == "created_at"
    assert direction == SortDirection.DESC

    # Default
    field, direction = SortParser.parse(None, allowed_fields=["created_at"])
    assert field == "created_at"
    assert direction == SortDirection.DESC

    # Invalid field
    with pytest.raises(ValueError, match="Invalid field"):
        SortParser.parse("invalid", allowed_fields=["name"])
```

---

## Running Tests

### Install Dependencies

```bash
pip install pytest pyyaml pydantic
```

### Run All Tests

Create test file `tests/contract/test_shared_resources.py` with all test code above, then:

```bash
pytest tests/contract/test_shared_resources.py -v
```

### Expected Output

```
test_base_resource_schema PASSED
test_schema_composition PASSED
test_labels_filter_parameter PASSED
test_base_resource_model PASSED
test_resource_inheritance PASSED
test_filter_parser PASSED
test_label_filter PASSED
test_pagination_helper PASSED
test_sort_parser PASSED
```

---

## Integration Example

Complete example using all components together:

```python
from fastapi import FastAPI, Query
from typing import Optional

app = FastAPI()

@app.get("/resources")
async def list_resources(
    limit: int = Query(20, ge=1, le=100),
    sort: Optional[str] = None,
    cursor: Optional[str] = None,
    name: Optional[str] = None,
    labels: Optional[Dict[str, str]] = None,
    include_total: bool = Query(False)
):
    # Parse filters
    filter_params = {"name": name} if name else {}
    filters = FilterParser.parse(filter_params, allowed_fields=["name"])

    # Parse labels
    label_filters = labels or {}

    # Parse sort
    sort_field, sort_direction = SortParser.parse(
        sort,
        allowed_fields=["name", "created_at"]
    )

    # Query database (pseudo-code)
    resources = db.query(Resource).filter(filters).filter_labels(label_filters).sort(sort_field, sort_direction).limit(limit).all()

    # Generate pagination
    pagination = PaginationHelper.generate_response(
        items=resources,
        limit=limit,
        cursor=cursor,
        base_url="https://api.example.com/resources",
        include_total=include_total,
        total_count=db.count(Resource) if include_total else None
    )

    return {
        "resources": [r.model_dump(mode='json') for r in resources],
        **pagination
    }
```

## Next Steps

1. Implement OpenAPI schemas in `contracts/shared-resources.openapi.yaml`
2. Implement Pydantic models in `src/nexus_shared/models/`
3. Implement utility functions in `src/nexus_shared/utils/`
4. Write comprehensive unit tests for all components
5. Create integration tests for end-to-end workflows
6. Document usage examples for consuming applications

## References

- [Feature Specification](spec.md)
- [Data Model](data-model.md)
- [Research Document](research.md)
- [OpenAPI Specification](contracts/shared-resources.openapi.yaml)
- [Contracts README](contracts/README.md)
