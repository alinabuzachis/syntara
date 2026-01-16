# OpenAPI Specifications Consolidated

The OpenAPI specifications for tool management have been consolidated and moved to:

**`/schemas/tool_manager/`**

This folder now contains redirects only. Please refer to the schemas folder for the current source of truth for all OpenAPI specifications.

## Available Specifications

- `openapi.yaml` - **Unified tool management API specification** (consolidates previous tools.yaml and tool-providers.yaml)
- `metrics.yaml` - Tool metrics API specification

## Changes Made in Consolidation

The previous separate specifications have been unified:
- **Before**: Separate `/tools` and `/tool-providers` endpoints in tools.yaml and tool-providers.yaml
- **After**: Single `/tool_manager` namespace in openapi.yaml with:
  - `/tool_manager/tools` - Tools management endpoints
  - `/tool_manager/tool_providers` - Tool providers management endpoints (note: underscore convention)

All specifications are now maintained in `/schemas/tool_manager/` with correct relative paths and updated formatting.
