# Workflow Runtime Telemetry - Quickstart Guide
| Field | Value |
|-------|-------|
| **Feature** | 030-workflow-runtime-telemetry |
| **Date** | 2026-02-17 |
| **Audience** | Nexus developers implementing or testing telemetry |

This guide provides a quick introduction to the workflow runtime telemetry feature, covering architecture, development setup, testing, and troubleshooting.

---

## Overview

### What is Workflow Runtime Telemetry?

Workflow runtime telemetry automatically captures execution metrics from Nexus workflows and transmits them to Segment.com for product analytics. This enables Red Hat to:

- Understand which workflows and tools are most frequently used
- Identify bottlenecks and optimization opportunities
- Track ecosystem adoption (partner/customer/ecosystem extensions)
- Make data-driven decisions for product improvement

### Key Characteristics

- **Always-On**: Telemetry is enabled by default with zero configuration
- **Privacy-First**: No PII, no parameter values, only structural metadata and aggregated metrics
- **Fire-and-Forget**: Events transmitted asynchronously without blocking workflow execution
- **Performance**: <5% overhead on workflow execution time (SC-002 requirement)
- **Anonymous**: Installation-level tracking via `entitlement_id`, no user-level identification

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Nexus Platform                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐         ┌──────────────────┐           │
│  │ Workflow       │         │ Telemetry        │           │
│  │ Engine         │────────>│ Interceptors     │           │
│  │ (Temporal)     │ events  │ (Workflow/       │           │
│  └────────────────┘         └────────┬─────────┘           │
│                                       │                     │
│                                       v                     │
│                             ┌──────────────────┐           │
│                             │ Telemetry        │           │
│                             │ Collector        │           │
│                             │ (Event Builders) │           │
│                             └────────┬─────────┘           │
│                                       │                     │
│                                       v                     │
│                             ┌──────────────────┐           │
│                             │ Segment Client   │           │
│                             │ (Python SDK)     │           │
│                             │ - Batching       │           │
│                             │ - Async Queue    │           │
│                             └────────┬─────────┘           │
│                                       │                     │
└───────────────────────────────────────┼─────────────────────┘
                                        │ HTTPS
                                        v
                              ┌──────────────────┐
                              │  Segment.com     │
                              │  (Dedicated      │
                              │  Nexus Account)  │
                              └──────────────────┘
```

### Event Flow

1. **Workflow Starts** → Workflow interceptor captures start event
2. **Activities Execute** → Activity interceptors capture activity events
3. **Events Built** → Event builders construct telemetry payloads
4. **Events Queued** → Handled by the Segment SDK
5. **Events Batched** → Handled by the Segment SDK
6. **Events Transmitted** → Handled by the Segment SDK
7. **Workflow Completes** → Handled by the Segment SDK

### Module Structure

```
/src/nexus/telemetry/              # NEW: Telemetry module
├── __init__.py
├── client.py                       # SegmentTelemetryClient (SDK wrapper)
├── collector.py                    # TelemetryCollector (event capture)
├── events/                         # Event builders
│   ├── __init__.py
│   ├── base.py                     # BaseTelemetryEvent (abstract)
│   ├── workflow_execution.py      # Workflow event builders
│   └── activity_execution.py      # Activity event builders
├── interceptors/                   # Workflow engine hooks
│   ├── __init__.py
│   ├── workflow_interceptor.py    # TelemetryWorkflowInterceptor
│   └── activity_interceptor.py    # TelemetryActivityInterceptor
└── sanitizers/                     # Data privacy
    ├── __init__.py
    └── data_sanitizer.py          # Data sanitization

/tests/
├── unit/telemetry/                 # Unit tests
├── integration/telemetry/          # Integration tests
└── contract/telemetry/             # Event contract tests (Pydantic models + Segment format)
```

---

## Data Model Architecture

### Technology Choices

Telemetry follows established Nexus conventions for non-database models:

| Component | Pattern | Rationale |
|-----------|---------|-----------|
| **Event models** | Pydantic `BaseModel` (frozen) | Matches Nexus DTO/event convention (13+ existing files use BaseModel for non-DB models) |
| **Configuration** | Pydantic `BaseSettings` | Matches all 16 existing config classes in `core/config/base.py` |
| **Validation** | Pydantic field constraints + validators | Type-safe construction with `Field(ge=0)`, `Literal[...]` enums, custom validators |
| **Serialization** | `model_dump()` + `to_segment_event()` | Explicit Segment format control |

### Why Not @dataclass?

In Nexus, `@dataclass` is reserved for internal-only structures (e.g., websocket connection tracking). All serialized event models and DTOs use Pydantic BaseModel for:

- **Built-in validation**: `Field(ge=0)` for numeric constraints, `Literal[...]` for enums
- **Immutability**: `ConfigDict(frozen=True)` prevents accidental mutation
- **Serialization**: `model_dump()` replaces manual dict construction
- **Consistency**: Same pattern as `ActivitySignalPayload`, `ExecutionSnapshotMessage`, etc.

### Why Not SQLModel?

Per the constitution, SQLModel is for **database-persisted** models. Telemetry events have zero database persistence (fire-and-forget to Segment.com).

### Example Event Model

```python
from pydantic import BaseModel, ConfigDict, Field

class WorkflowExecutionCompletedEvent(BaseModel):
    """Workflow execution completion telemetry event."""

    model_config = ConfigDict(frozen=True)

    entitlement_id: str
    correlation_id: str
    status: Literal["success", "failed", "timeout", "cancelled"]
    duration_ms: int = Field(ge=0)
    # ...

    def to_segment_event(self) -> dict:
        """Convert to Segment Track API format.

        Note: Segment automatically adds timestamp when event is sent.
        """
        return {
            "userId": self.entitlement_id,
            "event": "Workflow Execution Completed",
            "properties": self.model_dump(),
        }
```

See [data-model.md](./data-model.md#implementation-references) for full model definitions.

---

## Development Setup

### Prerequisites

1. **Running Nexus development environment**:
   ```bash
   make dev-up
   ```

2. **Segment write API key** (for testing):
   - Development: Use test Segment workspace key
   - Production: Key injected at container build time

### Configuration

#### Local Development (.env)

```bash
# .env file
NEXUS_SEGMENT_ENDPOINT=https://api.segment.io/v1  # Default Segment endpoint
```

#### Build-Time Injection (Production)

For production deployments, the Segment key is embedded in the container image:

```bash
# Build with telemetry key
docker build \
  --build-arg SEGMENT_WRITE_KEY="${NEXUS_SEGMENT_WRITE_KEY}" \
  -t nexus:latest \
  -f containers/nexus/Containerfile .
```

### Installation Dependencies

Telemetry dependencies are included in `pyproject.toml`:

```toml
[project.dependencies]
...
pydantic = ">=2.0.0"          # Event models and validation
pydantic-settings = ">=2.0.0" # Configuration
analytics-python = "^2.3.0"   # Segment Python SDK
```

Install with:
```bash
uv sync
```

---

## Running Tests

### Unit Tests

Test individual telemetry components (event builders, sanitizers, client):

```bash
# All telemetry unit tests
make test-unit module=telemetry

# Specific test file
uv run pytest tests/unit/telemetry/test_events.py -v

# With coverage
uv run pytest tests/unit/telemetry/ --cov=src/nexus/telemetry --cov-report=term
```

### Integration Tests

Test Segment SDK integration with mocked API:

```bash
# All telemetry integration tests
make test-integration module=telemetry

# Specific scenario
uv run pytest tests/integration/telemetry/test_segment_transmission.py -v
```

**Note**: Integration tests use `respx` to mock Segment HTTP API, avoiding real network calls.

### Contract Tests

Validate event structure and Segment payload format:

```bash
# Event contract tests
make test-contract module=telemetry

# Specific event validation
uv run pytest tests/contract/telemetry/test_event_contracts.py::test_workflow_completed_event -v
```

**What's Tested**:
- Pydantic model validation (field types, constraints, immutability)
- `to_segment_event()` output format matches Segment Track API spec
- Required fields presence (`userId`, `event`, `properties`)
- Event name formatting (Title Case convention)
- Property serialization (snake_case)

### Performance Tests

Validate <5% telemetry overhead (SC-002):

```bash
# Run performance tests
uv run pytest tests/performance/telemetry/ -m performance -v

# With detailed output
uv run pytest tests/performance/telemetry/test_overhead.py::test_workflow_telemetry_overhead -v -s
```

**Acceptance Criteria**: All performance tests must show <5% overhead.

---

## Testing Telemetry Locally

### Option 1: Test with Invalid Segment Key

Verify error handling by using an incorrect Segment write key:

```python
# In your test
import pytest
from nexus.telemetry.client import SegmentTelemetryClient
from nexus.core.config.base import TelemetrySettings
from nexus.telemetry.events.workflow_execution import WorkflowExecutionStartedEvent

@pytest.mark.asyncio
async def test_telemetry_with_invalid_key():
    """Test telemetry handles invalid Segment key gracefully."""

    # Configure with invalid key
    config = TelemetrySettings(
        segment_write_key="invalid-key-12345",
    )
    client = SegmentTelemetryClient(config)

    # Create event
    event = WorkflowExecutionStartedEvent(
        entitlement_id="test-id",
        correlation_id="550e8400-e29b-41d4-a716-446655440000",
        workflow_hash="a" * 64,
    )

    # Fire-and-forget: no exception raised, but logs show auth error
    # Segment SDK queues event, transmission fails silently
    client.send_event(event)

    # Verify error logged (check logs for authentication failures)
    # In production: fire-and-forget means workflow continues despite telemetry failure
```

### Option 2: Test Segment Workspace

Create a test workspace in Segment.com:

1. Sign up for free Segment account (development tier)
2. Create "Nexus Test" workspace
3. Copy write key to `.env` file
4. Run workflows and view events in Segment debugger

**Segment Debugger**: https://app.segment.com/YOUR_WORKSPACE/debugger

---

## Verifying Event Transmission

### Check Telemetry Logs

Telemetry events are logged at DEBUG level:

```bash
# Enable debug logging
export NEXUS_LOG_LEVEL=DEBUG

# Run Nexus
make dev-up

# Tail logs
docker logs -f nexus-api

# Look for telemetry log entries
# [DEBUG] nexus.telemetry.client: Sending event: Workflow Execution Started
# [DEBUG] nexus.telemetry.client: Event transmitted successfully
```

### Debug Mode

Enable Segment SDK debug mode:

```bash
# .env
NEXUS_SEGMENT_DEBUG=true
```

This logs all Segment SDK activity (batching, transmission, errors).

### Inspect Events

View event payloads before transmission:

```python
# In telemetry client
from nexus.telemetry.client import SegmentTelemetryClient

client = SegmentTelemetryClient()

# Log event before sending
logger.debug(f"Telemetry event: {json.dumps(event, indent=2)}")
client.send_event(event)
```

---

## Performance Testing

### Baseline vs Telemetry Comparison

Measure workflow execution time with and without telemetry:

```python
import time
from uuid import uuid4

# Baseline (telemetry client mocked to no-op)
start = time.perf_counter()
await execute_workflow()  # with TelemetryClientRegistry mocked
baseline_duration = time.perf_counter() - start

# With telemetry (real telemetry interceptors active)
start = time.perf_counter()
await execute_workflow()  # with real TelemetryClientRegistry
telemetry_duration = time.perf_counter() - start

# Calculate overhead
overhead_pct = ((telemetry_duration - baseline_duration) / baseline_duration) * 100

print(f"Baseline: {baseline_duration:.4f}s")
print(f"Telemetry: {telemetry_duration:.4f}s")
print(f"Overhead: {overhead_pct:.2f}%")

# Validate SC-002
assert overhead_pct < 5.0, f"Overhead {overhead_pct:.2f}% exceeds 5% limit"
```

### Performance Test Scenarios

Run comprehensive performance test suite:

```bash
# All scenarios (small, large, concurrent workflows)
uv run pytest tests/performance/telemetry/test_scenarios.py -v

# Specific scenario
uv run pytest tests/performance/telemetry/test_scenarios.py::TestLargeWorkflowScenarios -v
```

### Continuous Monitoring

Performance regression detection runs in CI:

```bash
# GitHub Actions: .github/workflows/performance.yml
# Runs on telemetry code changes and weekly schedule
# Fails if overhead increases >10% from baseline
```

---

## Troubleshooting

### Common Issues

#### 1. Segment SDK Connection Failures

**Symptom**: Logs show `ConnectionError` or `TimeoutError`

**Cause**: Network connectivity issues or invalid Segment key

**Solution**:
```bash
# Verify key is set
echo $NEXUS_SEGMENT_WRITE_KEY

# Test Segment endpoint manually
curl -X POST https://api.segment.io/v1/track \
  -H "Content-Type: application/json" \
  -u "${NEXUS_SEGMENT_WRITE_KEY}:" \
  -d '{"userId":"test","event":"Test Event"}'
```

#### 2. Event Validation Errors

**Symptom**: Logs show `pydantic.ValidationError`

**Cause**: Event construction failed due to invalid data (wrong types, missing fields, constraint violations)

**Solution**:
```python
# Run contract tests to verify event models
uv run pytest tests/contract/telemetry/ -v

# Debug specific event construction
from nexus.telemetry.events.workflow_execution import WorkflowExecutionCompletedEvent

try:
    event = WorkflowExecutionCompletedEvent(
        entitlement_id="test-id",
        correlation_id="invalid-uuid",  # Will fail UUID validation
        # ... other fields
    )
except ValidationError as e:
    print(e.errors())  # Shows which fields failed validation
```

#### 3. Performance Overhead Exceeds Target

**Symptom**: Performance tests fail with ">5% overhead"

**Cause**: Excessive event volume or blocking telemetry operations

**Solution**:
```bash
# Profile telemetry overhead
uv run pytest tests/performance/telemetry/test_overhead.py -v -s --profile

# Check for blocking operations (should be async)
# Review telemetry client for .flush() calls in hot paths
# Ensure fire-and-forget pattern (no awaits on telemetry)
```

#### 4. Events Not Appearing in Segment

**Symptom**: No events in Segment debugger after workflow execution

**Possible Causes**:
1. **Invalid write key**: Verify key in Segment dashboard
2. **SDK batching delay**: Wait up to 30 seconds for batch flush
3. **Event validation failure**: Check logs for Pydantic ValidationErrors during event construction

**Solution**:
```bash
# Force immediate flush (for debugging only)
analytics.flush()  # Blocks until queue empty

# Enable debug mode
export NEXUS_SEGMENT_DEBUG=true
```

---

## Debug Mode

### Enable Comprehensive Logging

```bash
# .env
NEXUS_LOG_LEVEL=DEBUG
NEXUS_SEGMENT_DEBUG=true
```

### Telemetry Debug Checklist

```python
# In src/nexus/telemetry/collector.py

from nexus.telemetry.events.workflow_execution import WorkflowExecutionStartedEvent
from pydantic import ValidationError

class TelemetryCollector:
    def capture_workflow_start(self, workflow_info: dict) -> None:
        """Capture workflow start event with Pydantic validation."""
        try:
            # 1. Construct event (Pydantic validates automatically)
            event = WorkflowExecutionStartedEvent(
                entitlement_id=self.config.entitlement_id,
                correlation_id=workflow_info["correlation_id"],
                workflow_hash=workflow_info["workflow_hash"],
            )
            logger.debug(f"Event constructed: {event.model_dump()}")

            # 2. Convert to Segment format
            segment_payload = event.to_segment_event()
            logger.debug(f"Segment payload: {segment_payload}")

            # 3. Send to Segment (fire-and-forget)
            self.client.send_event(event)
            logger.debug("Event queued for transmission")

        except ValidationError as e:
            # Pydantic validation failed during construction
            logger.error(f"Event validation failed: {e}")
            return  # Fire-and-forget: log but don't raise
        except Exception as e:
            logger.error(f"Failed to send event: {e}")
```

---

## Best Practices

### DO

✅ **Use mocks for testing**: Mock Segment API with `respx` to avoid external dependencies
✅ **Validate events early**: Pydantic validates models at construction - write comprehensive contract tests
✅ **Monitor overhead**: Run performance tests regularly to ensure <5% overhead
✅ **Log failures**: Log telemetry errors but never block workflow execution
✅ **Test privacy**: Verify no PII or parameter values in events
✅ **Use test workspace**: Create dedicated Segment workspace for development/staging

### DON'T

❌ **Don't block workflows**: Never use `analytics.flush()` in request handlers or workflow code
❌ **Don't include secrets**: Never include credentials, API keys, or PII in telemetry events
❌ **Don't await telemetry**: Fire-and-forget pattern - don't await or check telemetry results
❌ **Don't bypass Pydantic**: Always use event models - never construct raw dicts for Segment payloads
❌ **Don't expose write key**: Never commit Segment write key to version control
❌ **Don't use production key locally**: Always use test Segment workspace for development

---

## Example Workflows

### Full Development Cycle

```bash
# 1. Set up environment
cp .env.example .env
# Add test Segment key to .env

# 2. Install dependencies
uv sync

# 3. Run tests
make test-unit module=telemetry
make test-integration module=telemetry
make test-contract module=telemetry

# 4. Run performance tests
uv run pytest tests/performance/telemetry/ -m performance

# 5. Start development environment
make dev-up

# 6. Execute test workflow
curl -X POST http://localhost:8000/api/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d @samples/workflows/simple-api-workflow.json

# 7. Verify telemetry in Segment debugger
# Visit: https://app.segment.com/YOUR_WORKSPACE/debugger

# 8. Check logs
docker logs -f nexus-api | grep telemetry
```

### CI/CD Testing

```bash
# Run in GitHub Actions
# .github/workflows/ci.yml includes telemetry tests

# Local CI simulation
make lint
make typecheck
make test-all
make test-contract module=telemetry
uv run pytest tests/performance/telemetry/ -m performance
```

---

## References

### Documentation

- **Feature Spec**: [spec.md](./spec.md)
- **Implementation Plan**: [plan.md](./plan.md)
- **Research**: [research.md](./research.md)
- **Data Model**: [data-model.md](./data-model.md)

### External Resources

- [Segment Python SDK Docs](https://segment.com/docs/connections/sources/catalog/libraries/server/python/)
- [Segment Track API](https://segment.com/docs/connections/spec/track/)
- [Pydantic Documentation](https://docs.pydantic.dev/latest/)
- [Temporal Python SDK](https://docs.temporal.io/develop/python)

### Parent SDP

- [ANSTRAT-1748-P1: Agentic Automation Telemetry Observability](~/Documents/RedHat/lightspeed/handbook/The Ansible Engineering Handbook/proposals/ANSTRAT-1748-P1-Agentic-Automation-Telemetry-Observability.md)

---

## Getting Help

### Internal Resources

- **Slack**: #nexus-platform (for general questions)
- **Slack**: #nexus-telemetry (for telemetry-specific issues)
- **Code Reviews**: Tag @nexus-telemetry-reviewers in PRs

### Debugging Support

If you encounter issues not covered in this guide:

1. Enable debug logging (`NEXUS_LOG_LEVEL=DEBUG`)
2. Check logs for error messages
3. Verify event schema validation
4. Test with mock Segment endpoint
5. Reach out in #nexus-telemetry with logs and context

---

**Last Updated**: 2026-02-17
**Maintainer**: Nexus Platform Team
