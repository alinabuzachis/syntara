# Tool Provider Factory Usage Guide

This document explains how to use the provider factory dependency injection system in Nexus.

## Overview

The provider factory is managed as a FastAPI application-scoped resource using `app.state`, eliminating global module state and providing clean lifecycle management.

## Core Design

### 1. Application Lifecycle Management

The factory is stored in `app.state` during FastAPI startup:

```python
# main.py
from nexus_tool_manager.lib.providers.factory import ProviderFactory

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize provider factory in app.state
    app.state.provider_factory = ProviderFactory()

    # Register all supported provider types
    app.state.provider_factory.register_provider_type("mcp", MCPProvider)
    app.state.provider_factory.register_provider_type("openapi", OpenAPIProvider)

    yield

    # Shutdown: Clean up provider factory
    app.state.provider_factory = None

app = FastAPI(lifespan=lifespan)
```

### 2. Dependency Injection

FastAPI endpoints inject the factory instance using a dependency:

```python
from nexus_api.dependencies import ProviderFactoryDep

@router.get("/provider-types")
async def list_provider_types(factory: ProviderFactoryDep) -> list[str]:
    return factory.get_registered_provider_types()

@router.post("/validate-instance")
async def validate_instance(
    request: ProviderInstanceRequest,
    factory: ProviderFactoryDep,
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

### Application Startup

Register provider types during application startup in the `lifespan` function:

```python
from nexus_tool_manager.lib.providers.factory import ProviderFactory

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize factory in app.state
    app.state.provider_factory = ProviderFactory()

    # Register all supported provider types
    app.state.provider_factory.register_provider_type("mcp", MCPProvider)
    app.state.provider_factory.register_provider_type("openapi", OpenAPIProvider)

    yield

    app.state.provider_factory = None
```

### FastAPI Endpoints

Use dependency injection to access the factory:

```python
from nexus_api.dependencies import ProviderFactoryDep

@router.post("/providers")
async def create_provider(
    request: ProviderCreateRequest,
    factory: ProviderFactoryDep,
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
from nexus_tool_manager.lib.providers.factory import ProviderFactory

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

def test_endpoint_with_mock_factory():
    # Create test factory
    test_factory = ProviderFactory()
    test_factory.register_provider_type("mock", MockProvider)

    # Override dependency
    app.dependency_overrides[get_provider_factory] = lambda: test_factory

    client = TestClient(app)
    response = client.get("/provider-types")
    assert response.status_code == 200
```

## Benefits

1. **No Global Module State**: Factory is stored in `app.state`, not module globals
2. **Proper Lifecycle Management**: Factory is initialized/cleaned up with the application
3. **Dependency Injection**: Clean separation of concerns in FastAPI endpoints
4. **Testing Isolation**: Each test can have its own factory instance
5. **Thread Safety**: Factory instances are thread-safe with proper locking
6. **Type Safety**: Full type annotations with dependency injection
7. **FastAPI Conventions**: Uses standard `app.state` pattern

## Key Design Decisions

### Provider Type Registration

- **Provider types are registered at application startup**, not dynamically via API
- This keeps the set of supported provider types explicit and version-controlled
- New provider types require code changes, ensuring proper testing and validation

### Instance Creation

- **Provider instances are created dynamically** based on user configuration
- The factory validates that configurations match registered provider types
- This allows users to configure multiple instances of the same provider type

### Lifecycle Management

- Factory is initialized once during application startup
- Factory instance is stored in `app.state` and shared across all requests
- Factory is cleaned up during application shutdown

## Implementation Details

### Dependency Function

The dependency function is defined in `nexus_api/dependencies.py`:

```python
from fastapi import Depends, Request
from nexus_tool_manager.lib.providers.factory import ProviderFactory

def get_provider_factory(request: Request) -> ProviderFactory:
    """Get the provider factory from application state."""
    if not hasattr(request.app.state, "provider_factory"):
        msg = "Provider factory not initialized."
        raise RuntimeError(msg)
    return request.app.state.provider_factory

# Type alias for convenience
ProviderFactoryDep = Annotated[ProviderFactory, Depends(get_provider_factory)]
```

This approach:

- Uses FastAPI's standard `Request` object to access `app.state`
- Provides clear error messages if factory isn't initialized
- Follows FastAPI dependency injection patterns
- No module-level global variables

## Example Usage

See `src/nexus_api/api/v1/tool_providers.py` (when implemented) for complete examples of using the dependency injection system in FastAPI endpoints.
