"""Unit tests for ToolProvider models.

Tests cover:
- ToolProvider creation with required fields
- Configuration validation
- MCPConfiguration model
- Provider status enum
- Field validation and constraints
- ToolProvider.tools relationship
- ToolProviderCreate model
- ToolProviderPatch model
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.tool_manager.models.tool import Tool, ToolStatus
from nexus.tool_manager.models.tool_provider import (
    ProviderStatus,
    ToolProvider,
    ToolProviderCreate,
    ToolProviderPatch,
)
from nexus.tool_manager.models.tool_provider_configuration import MCPConfiguration


@pytest.mark.asyncio
async def test_create_tool_provider_with_required_fields(test_db_session: AsyncSession, test_user: User) -> None:
    """Test creating a tool provider with all required fields."""
    provider_id = uuid4()

    config = {
        "provider_type": "mcp",
        "base_url": "https://api.example.com",
        "api_key": "test-key",
    }

    provider = ToolProvider(
        id=provider_id,
        name="Test Provider",
        configuration=config,
        created_by=test_user.id,
    )
    test_db_session.add(provider)
    await test_db_session.commit()
    await test_db_session.refresh(provider)

    assert provider.id == provider_id
    assert provider.name == "Test Provider"
    assert provider.configuration.provider_type == "mcp"
    assert isinstance(provider.configuration, MCPConfiguration)
    assert provider.configuration.base_url == "https://api.example.com"
    assert provider.configuration.api_key == "test-key"
    assert provider.enabled is True  # Default value
    assert provider.status == ProviderStatus.VALIDATING  # Default value
    assert provider.last_validated_at is None
    assert provider.validation_error is None
    assert provider.created_by == test_user.id
    assert provider.created_at is not None
    assert provider.updated_at is not None


@pytest.mark.asyncio
async def test_create_tool_provider_with_all_fields(test_db_session: AsyncSession, test_user: User) -> None:
    """Test creating a tool provider with all fields including optional ones."""
    provider_id = uuid4()
    now = datetime.now(UTC)

    config = {
        "provider_type": "mcp",
        "base_url": "https://custom.provider.com",
        "api_key": "custom-token",
    }

    provider = ToolProvider(
        id=provider_id,
        name="Full Test Provider",
        description="A test provider with all fields",
        configuration=config,
        enabled=False,
        status=ProviderStatus.ERROR,
        last_validated_at=now,
        validation_error="Connection timeout",
        created_by=test_user.id,
        labels={"env": "test", "region": "us-east-1"},
    )
    test_db_session.add(provider)
    await test_db_session.commit()
    await test_db_session.refresh(provider)

    assert provider.enabled is False
    assert provider.status == ProviderStatus.ERROR
    assert provider.last_validated_at == now
    assert provider.validation_error == "Connection timeout"
    assert provider.labels == {"env": "test", "region": "us-east-1"}


def test_tool_provider_configuration_validation(test_user: User) -> None:
    """Test validation of configuration field."""
    # Valid configuration should work
    valid_config = {
        "provider_type": "mcp",
        "base_url": "https://api.example.com",
        "api_key": "test-key",
    }
    provider = ToolProvider(
        id=uuid4(),
        name="Test Provider",
        configuration=valid_config,
        created_by=test_user.id,
    )
    assert provider.configuration.provider_type == "mcp"
    assert isinstance(provider.configuration, MCPConfiguration)
    assert provider.configuration.base_url == "https://api.example.com"
    assert provider.configuration.api_key == "test-key"

    # Missing provider_type should raise ValueError
    with pytest.raises(Exception, match=r"1 validation error for ToolProvider"):
        ToolProvider(
            id=uuid4(),
            name="Test Provider",
            configuration={"base_url": "https://api.example.com"},
            created_by=test_user.id,
        )

    # Empty provider_type should raise ValidationError
    with pytest.raises(Exception, match="3 validation errors for ToolProvider"):
        ToolProvider(
            id=uuid4(),
            name="Test Provider",
            configuration={"provider_type": ""},
            created_by=test_user.id,
        )

    # Whitespace-only provider_type should raise ValidationError
    with pytest.raises(Exception, match=r"3 validation errors for ToolProvider"):
        ToolProvider(
            id=uuid4(),
            name="Test Provider",
            configuration={"provider_type": "   "},
            created_by=test_user.id,
        )

    # Non-string provider_type should raise ValidationError
    with pytest.raises(Exception, match=r"3 validation errors for ToolProvider"):
        ToolProvider(
            id=uuid4(),
            name="Test Provider",
            configuration={"provider_type": 123},
            created_by=test_user.id,
        )


def test_provider_status_enum() -> None:
    """Test ProviderStatus enum values."""
    assert ProviderStatus.AVAILABLE.value == "available"
    assert ProviderStatus.ERROR.value == "error"
    assert ProviderStatus.VALIDATING.value == "validating"


def test_mcp_configuration_model() -> None:
    """Test MCPConfiguration model."""
    config = MCPConfiguration(
        base_url="https://mcp.example.com",
        api_key="test-api-key",
    )

    assert config.provider_type == "mcp"  # Default value
    assert config.base_url == "https://mcp.example.com"
    assert config.api_key == "test-api-key"


def test_mcp_configuration_provider_type_validation() -> None:
    """Test MCPConfiguration provider_type validation."""
    # Default provider_type should be "mcp"
    config = MCPConfiguration(
        base_url="https://mcp.example.com",
        api_key="test-api-key",
    )
    assert config.provider_type == "mcp"

    # Explicitly setting provider_type to "mcp" should work
    config = MCPConfiguration(
        provider_type="mcp",
        base_url="https://mcp.example.com",
        api_key="test-api-key",
    )
    assert config.provider_type == "mcp"

    # Setting provider_type to anything else should raise ValidationError
    with pytest.raises(Exception, match="Input should be 'mcp'"):
        MCPConfiguration(
            provider_type="custom",
            base_url="https://mcp.example.com",
            api_key="test-api-key",
        )


@pytest.mark.asyncio
async def test_tool_provider_constraints(test_db_session: AsyncSession, test_user: User) -> None:
    """Test tool provider field constraints."""
    provider_id = uuid4()

    # Test that ToolProvider can be created with valid configuration
    provider = ToolProvider(
        id=provider_id,
        name="Test Provider",
        configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        created_by=test_user.id,
    )
    test_db_session.add(provider)
    await test_db_session.commit()
    assert provider.name == "Test Provider"


@pytest.mark.asyncio
async def test_tool_provider_tools_relationship(
    test_db_session: AsyncSession, test_tool_provider: ToolProvider, test_user: User
) -> None:
    """Test the relationship between ToolProvider and Tool."""
    # Create tools for the provider
    tool1 = Tool(
        id=uuid4(),
        provider_id=test_tool_provider.id,
        name="First Tool",
        namespaced_name="test_provider::first_tool",
        status=ToolStatus.AVAILABLE,
        created_by=test_user.id,
    )
    tool2 = Tool(
        id=uuid4(),
        provider_id=test_tool_provider.id,
        name="Second Tool",
        namespaced_name="test_provider::second_tool",
        status=ToolStatus.ERROR,
        created_by=test_user.id,
    )

    test_db_session.add_all([tool1, tool2])
    await test_db_session.commit()
    await test_db_session.refresh(test_tool_provider)

    # Load provider with tools relationship using selectinload
    result = await test_db_session.exec(
        select(ToolProvider)
        .options(selectinload(ToolProvider.tools))  # type: ignore[arg-type]
        .where(ToolProvider.id == test_tool_provider.id)
    )
    _provider = result.first()

    # Check relationship
    assert _provider is not None
    assert len(_provider.tools) == 2
    tool_names = {t.name for t in _provider.tools}
    assert tool_names == {"First Tool", "Second Tool"}

    # Verify each tool references the correct provider
    for tool in _provider.tools:
        assert tool.provider_id == test_tool_provider.id

    # Check that tools have the expected statuses
    tool_statuses = {t.status for t in _provider.tools}
    assert tool_statuses == {ToolStatus.AVAILABLE, ToolStatus.ERROR}


@pytest.mark.asyncio
async def test_tool_provider_cascade_delete_tools(
    test_db_session: AsyncSession, test_tool_provider: ToolProvider, test_user: User
) -> None:
    """Test that deleting a ToolProvider cascades to delete its Tools."""
    # Create tools for the existing test provider
    tool1 = Tool(
        id=uuid4(),
        provider_id=test_tool_provider.id,
        name="Tool 1",
        namespaced_name="test_provider::tool1",
        status=ToolStatus.AVAILABLE,
        created_by=test_user.id,
    )
    tool2 = Tool(
        id=uuid4(),
        provider_id=test_tool_provider.id,
        name="Tool 2",
        namespaced_name="test_provider::tool2",
        status=ToolStatus.AVAILABLE,
        created_by=test_user.id,
    )

    test_db_session.add_all([tool1, tool2])
    await test_db_session.commit()

    # Verify tools exist
    tools_result = await test_db_session.exec(select(Tool).where(Tool.provider_id == test_tool_provider.id))
    tools = tools_result.all()
    assert len(tools) == 2

    # Delete the provider
    await test_db_session.delete(test_tool_provider)
    await test_db_session.commit()

    # Verify tools are cascade deleted
    tools_after_delete = await test_db_session.exec(select(Tool).where(Tool.provider_id == test_tool_provider.id))
    assert len(tools_after_delete.all()) == 0


@pytest.mark.asyncio
async def test_tool_provider_name_unique_constraint(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that ToolProvider.name unique constraint works correctly."""
    # Create first provider with a specific name
    provider1 = ToolProvider(
        id=uuid4(),
        name="Unique Provider Name",
        configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        created_by=test_user.id,
    )
    test_db_session.add(provider1)
    await test_db_session.commit()

    # Try to create another provider with the same name (should fail)
    provider2 = ToolProvider(
        id=uuid4(),
        name="Unique Provider Name",  # Same name (should fail)
        configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        created_by=test_user.id,
    )
    test_db_session.add(provider2)

    # Should raise IntegrityError due to unique constraint violation
    with pytest.raises(Exception, match=r".*unique.*|.*constraint.*"):
        await test_db_session.commit()


@pytest.mark.asyncio
async def test_tool_provider_different_names_allowed(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that different provider names are allowed."""
    # Create multiple providers with different names (should work)
    provider1 = ToolProvider(
        id=uuid4(),
        name="Provider Alpha",
        configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        created_by=test_user.id,
    )
    provider2 = ToolProvider(
        id=uuid4(),
        name="Provider Beta",
        configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        created_by=test_user.id,
    )

    test_db_session.add_all([provider1, provider2])
    await test_db_session.commit()  # Should succeed
    await test_db_session.refresh(provider1)
    await test_db_session.refresh(provider2)

    # Verify both providers were created successfully
    assert provider1.name == "Provider Alpha"
    assert provider2.name == "Provider Beta"


@pytest.mark.asyncio
async def test_tool_provider_name_case_sensitivity(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that provider names are case-sensitive for uniqueness."""
    # Create first provider with lowercase name
    provider1 = ToolProvider(
        id=uuid4(),
        name="test provider",
        configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        created_by=test_user.id,
    )
    test_db_session.add(provider1)
    await test_db_session.commit()

    # Create second provider with different case (should work - case-sensitive)
    provider2 = ToolProvider(
        id=uuid4(),
        name="Test Provider",  # Different case
        configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        created_by=test_user.id,
    )
    test_db_session.add(provider2)
    await test_db_session.commit()  # Should succeed
    await test_db_session.refresh(provider2)

    # Verify both providers exist with their respective names
    assert provider1.name == "test provider"
    assert provider2.name == "Test Provider"


def test_tool_provider_create_model() -> None:
    """Test ToolProviderCreate model."""
    config = {
        "provider_type": "mcp",
        "base_url": "https://api.example.com",
        "api_key": "test-key",
    }

    provider_create = ToolProviderCreate(
        name="Test Provider",
        description="A test provider",
        configuration=config,
    )

    assert provider_create.name == "Test Provider"
    assert provider_create.description == "A test provider"
    assert provider_create.configuration.provider_type == "mcp"
    assert isinstance(provider_create.configuration, MCPConfiguration)
    assert provider_create.configuration.base_url == "https://api.example.com"
    assert provider_create.configuration.api_key == "test-key"


def test_tool_provider_create_validation() -> None:
    """Test ToolProviderCreate validation."""
    # Valid creation should work
    valid_config = {
        "provider_type": "mcp",
        "base_url": "https://api.example.com",
        "api_key": "test-key",
    }
    provider_create = ToolProviderCreate(
        name="Test Provider",
        configuration=valid_config,
    )
    assert provider_create.name == "Test Provider"
    assert provider_create.configuration.provider_type == "mcp"
    assert isinstance(provider_create.configuration, MCPConfiguration)
    assert provider_create.configuration.base_url == "https://api.example.com"
    assert provider_create.configuration.api_key == "test-key"

    # Missing provider_type should raise ValueError
    with pytest.raises(Exception, match="Unable to extract tag using discriminator 'provider_type'"):
        ToolProviderCreate(
            name="Test Provider",
            configuration={"base_url": "https://api.example.com"},
        )

    # Empty provider_type should raise ValidationError
    with pytest.raises(Exception, match="does not match any of the expected tags"):
        ToolProviderCreate(
            name="Test Provider",
            configuration={"provider_type": ""},
        )


def test_tool_provider_patch_model() -> None:
    """Test ToolProviderPatch model."""
    # Test with all fields
    config = {
        "provider_type": "mcp",
        "base_url": "https://api.example.com",
        "api_key": "test-key",
    }

    provider_patch = ToolProviderPatch(
        name="Updated Provider",
        description="Updated description",
        configuration=config,
    )

    assert provider_patch.name == "Updated Provider"
    assert provider_patch.description == "Updated description"
    assert provider_patch.configuration is not None
    assert provider_patch.configuration.provider_type == "mcp"
    assert isinstance(provider_patch.configuration, MCPConfiguration)
    assert provider_patch.configuration.base_url == "https://api.example.com"
    assert provider_patch.configuration.api_key == "test-key"

    # Test with no fields (all optional)
    empty_patch = ToolProviderPatch()
    assert empty_patch.name is None
    assert empty_patch.description is None
    assert empty_patch.configuration is None

    # Test with partial fields
    partial_patch = ToolProviderPatch(name="New Name")
    assert partial_patch.name == "New Name"
    assert partial_patch.description is None
    assert partial_patch.configuration is None


def test_tool_provider_patch_validation() -> None:
    """Test ToolProviderPatch validation."""
    # Valid configuration should work
    valid_config = {
        "provider_type": "mcp",
        "base_url": "https://api.example.com",
        "api_key": "test-key",
    }
    provider_patch = ToolProviderPatch(configuration=valid_config)
    assert provider_patch.configuration is not None
    assert provider_patch.configuration.provider_type == "mcp"
    assert isinstance(provider_patch.configuration, MCPConfiguration)
    assert provider_patch.configuration.base_url == "https://api.example.com"
    assert provider_patch.configuration.api_key == "test-key"

    # Invalid configuration should raise ValidationError
    with pytest.raises(Exception, match="Unable to extract tag using discriminator 'provider_type'"):
        ToolProviderPatch(
            configuration={"base_url": "https://api.example.com"},
        )
