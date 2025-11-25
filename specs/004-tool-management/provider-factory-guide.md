# Tool Provider Factory Usage Guide

This document explains how to use the provider factory dependency injection system in Nexus.

## Overview

The provider factory uses an async generator pattern for dependency injection, providing a pre-configured singleton instance with registered provider types.

## Core Design

### 1. Pre-configured Factory

The factory is pre-configured as a module-level singleton with registered provider types:

```python
# In nexus.tool_manager.lib.providers.factory
_provider_factory: ProviderFactory = ProviderFactory()
_provider_factory.register_provider_type("mcp", MCPProvider)

async def get_provider_factory() -> AsyncGenerator[ProviderFactory]:
    """Create a ProviderFactory for dependency injection."""
    yield _provider_factory
```

### 2. Dependency Injection

FastAPI endpoints inject the factory using FastAPI's dependency system:

```python
from fastapi import Depends
from nexus.tool_manager.lib.providers.factory import ProviderFactory, get_provider_factory

@router.get("/provider-types")
async def list_provider_types(
    factory: ProviderFactory = Depends(get_provider_factory)
) -> list[str]:
    return factory.get_registered_provider_types()

@router.post("/validate-instance")
async def validate_instance(
    request: ProviderInstanceRequest,
    factory: ProviderFactory = Depends(get_provider_factory),
) -> dict[str, Any]:
    instance = factory.create_provider_instance(
        provider_type=request.provider_type,
        **request.configuration,
    )
    return {"valid": True, "provider_type": request.provider_type}
```

## Available Methods

The `ProviderFactory` class provides the following methods:

- `factory.register_provider_type(provider_type, provider_class)` - Register a provider type
- `factory.create_provider_instance(provider_type, **kwargs)` - Create a provider instance
- `factory.get_registered_provider_types()` - Get list of registered provider types
- `factory.is_registered(provider_type)` - Check if a provider type is registered
- `factory.unregister_provider_type(provider_type)` - Unregister a provider type

## Usage Patterns

### Pre-configured Factory

Provider types are registered at module initialization:

```python
# nexus.tool_manager.lib.providers.factory
from nexus.tool_manager.lib.providers.mcp import MCPProvider

# Module-level singleton with pre-registered providers
_provider_factory: ProviderFactory = ProviderFactory()
_provider_factory.register_provider_type("mcp", MCPProvider)
# Add more provider types here as needed

async def get_provider_factory() -> AsyncGenerator[ProviderFactory]:
    """Dependency injection function for FastAPI."""
    yield _provider_factory
```

### FastAPI Endpoints

Use FastAPI's standard dependency injection:

```python
from fastapi import Depends
from nexus.tool_manager.lib.providers.factory import ProviderFactory, get_provider_factory

@router.post("/providers")
async def create_provider(
    request: ProviderCreateRequest,
    factory: ProviderFactory = Depends(get_provider_factory),
):
    # Create provider instance based on user configuration
    instance = factory.create_provider_instance(
        request.provider_type,
        **request.config
    )

    # Validate the provider works
    await instance.validate_connection()

    return {"success": True}
```

### Non-FastAPI Code

Create your own factory instance for scripts or non-web contexts:

```python
from nexus.tool_manager.lib.providers.factory import ProviderFactory

# Create factory instance
factory = ProviderFactory()

# Register and use providers
factory.register_provider_type("mcp", MCPProvider)
instance = factory.create_provider_instance("mcp", config={})
```

### Testing

Easy to test with isolated factory instances:

```python
def test_provider_functionality():
    # Each test gets its own factory
    factory = ProviderFactory()
    factory.register_provider_type("mock", MockProvider)

    instance = factory.create_provider_instance("mock")
    assert isinstance(instance, MockProvider)
```

You can also override the dependency in FastAPI tests:

```python
from fastapi.testclient import TestClient
from nexus.tool_manager.lib.providers.factory import get_provider_factory

async def test_factory_override():
    # Create test factory
    test_factory = ProviderFactory()
    test_factory.register_provider_type("mock", MockProvider)

    async def override_factory():
        yield test_factory

    # Override dependency
    app.dependency_overrides[get_provider_factory] = override_factory

    client = TestClient(app)
    response = client.get("/provider-types")
    assert response.status_code == 200
```

## Benefits

1. **Simple Singleton Pattern**: One pre-configured factory instance shared across the application
2. **Pre-registered Providers**: Provider types are registered at module load time
3. **Dependency Injection**: Clean integration with FastAPI's dependency system
4. **Testing Isolation**: Tests can override dependencies for isolation
5. **Thread Safety**: Factory instances are thread-safe with proper locking
6. **Type Safety**: Full type annotations with dependency injection
7. **Async Generator Pattern**: Uses FastAPI's standard async dependency pattern

## Key Design Decisions

### Provider Type Registration

- **Provider types are registered at module initialization**, not dynamically via API
- This keeps the set of supported provider types explicit and version-controlled
- New provider types require code changes, ensuring proper testing and validation

### Instance Creation

- **Provider instances are created dynamically** based on user configuration
- The factory validates that configurations match registered provider types
- This allows users to configure multiple instances of the same provider type

### Lifecycle Management

- Factory is initialized once at module load time
- Factory instance is shared across all requests via dependency injection
- Factory persists for the lifetime of the application process

## Implementation Details

### Dependency Function

The dependency function is defined in `nexus.tool_manager.lib.providers.factory`:

```python
from collections.abc import AsyncGenerator

# Module-level singleton
_provider_factory: ProviderFactory = ProviderFactory()
_provider_factory.register_provider_type("mcp", MCPProvider)

async def get_provider_factory() -> AsyncGenerator[ProviderFactory]:
    """Create a ProviderFactory for dependency injection.

    Yields:
        ProviderFactory for dependency injection
    """
    yield _provider_factory
```

This approach:

- Uses an async generator pattern for FastAPI dependency injection
- Pre-configures provider types at module initialization
- Follows FastAPI's async dependency patterns
- Provides a singleton factory instance

## Example Usage

See `src/nexus/api/v1/tool_providers.py` (when implemented) for complete examples of using the dependency injection system in FastAPI endpoints.
