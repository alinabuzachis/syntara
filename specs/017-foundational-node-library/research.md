# Research: AAP Job Template Executor Implementation

**Feature**: Foundational Node Library Updates
**Date**: 2025-12-01
**Spec**: [spec.md](./spec.md)

## Research Questions

### 1. AAP Controller API v2 Integration

**Question**: How do we authenticate and launch job templates via AAP API?

**Research Findings**:
- **Authentication**: AAP Controller API v2 uses Bearer token authentication
  - Token obtained from AAP credentials (username/password or OAuth token)
  - Header format: `Authorization: Bearer {token}`
- **Job Template Launch Endpoint**: `POST /api/v2/job_templates/{id}/launch/`
- **Required Parameters**:
  - `job_template_id`: Integer ID of the job template (in URL path)
  - Authentication credentials (in header)
- **Optional Parameters** (in request body):
  - `inventory`: Override default inventory (string or ID)
  - `credentials`: Array of credential IDs to use
  - `extra_vars`: Dictionary of extra variables (JSON object)
  - `limit`: Host pattern to limit execution (string)
  - `tags`: Ansible tags to run (comma-separated string)
  - `skip_tags`: Ansible tags to skip (comma-separated string)
  - `verbosity`: Job verbosity level (0-5, integer)

**Decision**: Use httpx async client for AAP API calls
**Rationale**:
- Async support (required for Temporal activities)
- Better performance than requests library
- Type-safe with proper typing support
**Alternatives Considered**:
- requests: Synchronous only, not suitable for async activities
- aiohttp: More complex API, httpx is simpler and more requests-like

### 2. AAP Job Status Polling

**Question**: How do we poll for job completion and retrieve results?

**Research Findings**:
- **Job Status Endpoint**: `GET /api/v2/jobs/{job_id}/`
- **Status Field Values**:
  - `pending`: Job queued but not started
  - `waiting`: Job waiting for dependencies
  - `running`: Job currently executing
  - `successful`: Job completed successfully
  - `failed`: Job failed with errors
  - `error`: System error occurred
  - `canceled`: Job was canceled by user
- **Polling Strategy**:
  - Poll every 5 seconds (AAP recommendation)
  - Check `status` field for terminal states: `successful`, `failed`, `error`, `canceled`
  - Use `finished` timestamp to detect completion
- **Job Output Retrieval**:
  - Stdout: `GET /api/v2/jobs/{job_id}/stdout/?format=txt`
  - Job events: `GET /api/v2/jobs/{job_id}/job_events/`
  - Artifacts: Available in job detail response (`artifacts` field)

**Decision**: Implement polling loop within Temporal activity using `asyncio.sleep()`
**Rationale**:
- Simpler than workflow-level polling (fewer moving parts)
- Temporal activities handle retries and failures automatically
- Activity can be cancelled if workflow is cancelled
- Durable execution - if worker crashes, activity resumes polling
**Alternatives Considered**:
- Workflow-level polling: More complex, requires multiple activities
- Webhook callback: Requires AAP configuration, not always available
- Activity heartbeat: Suitable but polling is simpler for this use case

### 3. Temporal Activity Patterns for Long-Running Jobs

**Question**: How should we structure the Temporal activity for AAP jobs that may run for minutes/hours?

**Research Findings**:
- **Activity Timeout Configuration**:
  - `start_to_close_timeout`: Maximum time activity can run
  - `schedule_to_close_timeout`: Maximum time from schedule to completion
  - `heartbeat_timeout`: Optional heartbeat for long-running activities
- **Heartbeat Pattern**:
  - Activity sends periodic heartbeats via `activity.heartbeat()`
  - If activity times out, workflow can retrieve last heartbeat payload
  - Useful for resuming polling from last known state
- **Polling Loop Pattern**:
  ```python
  @activity.defn
  async def execute_aap_job_template(config):
      job_id = await launch_job(config)

      while True:
          if activity.is_cancelled():
              await cancel_aap_job(job_id)
              raise ActivityCancelledException()

          status = await poll_job_status(job_id)

          if status in ['successful', 'failed', 'error', 'canceled']:
              break

          activity.heartbeat(job_id)  # Optional: report progress
          await asyncio.sleep(5)

      return await get_job_result(job_id)
  ```

**Decision**: Use activity with polling loop and heartbeat for progress reporting
**Rationale**:
- Single activity simplifies workflow definition
- Heartbeat allows resuming from last polled state if worker crashes
- Activity timeout prevents infinite polling
- Activity cancellation propagates to AAP job cancellation
**Alternatives Considered**:
- Multiple activities (launch + poll): More complex workflow
- No heartbeat: Cannot resume polling if activity times out and retries

### 4. JSON Schema Validation with Custom Error Messages

**Question**: How do we customize error messages for deprecated features in JSON schema?

**Research Findings**:
- **JSON Schema Error Messages**:
  - `description` field: Shown in documentation and some validators
  - `$comment` field: Not included in validation errors (internal use only)
  - `errorMessage` extension: Supported by ajv validator (used by many tools)
  - Enum error messages: Show allowed values automatically
- **Deprecation Patterns**:
  - Remove from enum: Clean break, clear error message
  - Add `deprecated: true`: Allows but warns (not suitable for hard removal)
  - Use `not` schema: Explicitly reject with custom message
- **oneOf Discriminator**:
  - `discriminator` field helps tools provide better errors
  - Maps discriminator value to specific schema
  - Example:
    ```json
    {
      "oneOf": [...],
      "discriminator": {
        "propertyName": "executor",
        "mapping": {
          "script": "#/definitions/scriptExecutorConfig",
          "aap_job_template": "#/definitions/aapJobTemplateExecutorConfig"
        }
      }
    }
    ```

**Decision**: Update schema enums to remove deprecated values, add descriptions for migration guidance
**Rationale**:
- Clean enum removal provides clearest error messages
- Description field guides users to supported alternatives
- No custom validator extensions needed (better compatibility)
- Workflow validation library (Pydantic) provides good error context
**Alternatives Considered**:
- Custom validator: More complex, harder to maintain
- errorMessage extension: Not standardized, limited tool support

## Technology Stack Summary

**Core Technologies**:
- Python 3.12 (existing)
- Temporal SDK (existing)
- SQLModel (existing - for executor config model)
- FastAPI (existing - workflow API)

**New Dependencies**:
- `httpx`: Async HTTP client for AAP API calls

**Testing**:
- pytest (existing)
- pytest-asyncio (existing - for async test support)
- httpx-mock or respx: HTTP mocking for AAP API tests

## Implementation Architecture

**Components**:
1. **AAPClient Service** (`src/nexus/workflows/workflow_engine/services/aap_client.py`)
   - Handles AAP API authentication
   - Provides methods: launch_job, poll_status, get_output, cancel_job
   - Injected into activity via dependency injection

2. **AAPJobTemplateActivity** (`src/nexus/workflows/workflow_engine/activities/aap_job_template_activity.py`)
   - Temporal activity with @activity.defn decorator
   - Accepts AAPJobTemplateExecutorConfig
   - Orchestrates: launch → poll → result
   - Handles cancellation and errors

3. **AAPJobTemplateExecutorConfig** (`src/nexus/workflows/workflow_engine/models/executor_config.py`)
   - SQLModel class extending ExecutorConfig
   - Fields: job_template_id, inventory, credentials, extra_vars, etc.
   - Validates configuration before execution

4. **Schema Updates** (`schemas/workflows/workflow-definition.schema.json`)
   - Add aap_job_template to executor enum
   - Add aapJobTemplateExecutorConfig definition
   - Remove deprecated features from enums
   - Update descriptions with migration guidance

## Risk Assessment

**Potential Risks**:
1. **AAP API Rate Limiting**: Polling every 5s might hit rate limits with many concurrent jobs
   - Mitigation: Use exponential backoff for polling if needed, implement rate limiting safeguards
2. **Long-Running Jobs**: Jobs may run for hours depending on playbook complexity
   - Mitigation: Users configure activity timeout per-task using `timeout` field (ISO 8601 duration)
3. **Network Failures**: AAP API calls may fail due to network issues
   - Mitigation: Temporal retry policies handle transient failures automatically
4. **Schema Breaking Changes**: Removing deprecated features breaks existing workflows
   - Mitigation: Version schema, document migration path, provide validation before deployment

**Mitigation Status**: All risks have documented mitigations in implementation plan

## References

- [AAP Controller API Documentation](https://docs.ansible.com/automation-controller/latest/html/controllerapi/api_ref.html)
- [Temporal Python SDK - Activities](https://docs.temporal.io/develop/python/core-application#develop-activities)
- [Temporal Activity Timeouts](https://docs.temporal.io/encyclopedia/detecting-activity-failures#activity-timeout)
- [JSON Schema Specification](https://json-schema.org/specification.html)
- [httpx Documentation](https://www.python-httpx.org/)

## Next Steps

Phase 1 (Design & Contracts):
1. Create data-model.md with AAPJobTemplateExecutorConfig definition
2. Update workflow-definition.schema.json with AAP executor and deprecated feature removals
3. Create quickstart.md with example AAP workflow
4. Update CLAUDE.md with new dependencies and changes
