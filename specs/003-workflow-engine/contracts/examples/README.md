# Workflow Definition Examples

This directory contains example workflow definitions that demonstrate the capabilities of the Nexus Workflow Engine. All examples validate against the JSON schema defined in `../workflow-definition.schema.json`.

## Examples Overview

### 1. Simple Sequential Workflow (`01-simple-sequential.yaml`)
**Demonstrates:**
- Sequential task execution with dependencies
- Manual trigger
- Basic task types (API calls, scripts, connectors)
- Activity-level timeouts and retry policies
- Input/output parameter mapping

**Use Case:** Basic data processing pipeline that fetches, validates, processes, and reports on data.

---

### 2. Parallel Execution Workflow (`02-parallel-execution.yaml`)
**Demonstrates:**
- Parallel execution of independent tasks
- Scheduled trigger (cron-based)
- Multiple data sources aggregation
- Different retry strategies per activity
- Timezone-aware scheduling

**Use Case:** Data aggregation from multiple sources (database, APIs, cloud storage) running on a schedule.

---

### 3. Conditional Branching Workflow (`03-conditional-branching.yaml`)
**Demonstrates:**
- Conditional logic based on runtime values
- Event-driven trigger (webhook)
- Human approval workflow with timeout handling
- Approval/rejection paths
- Decision-based routing

**Use Case:** Order processing with conditional approval requirements based on amount and risk score.

---

### 4. Looping Workflow (`04-looping.yaml`)
**Demonstrates:**
- `forEach` loop for iterating over collections
- `while` loop for retry logic
- Nested loops and conditions
- Batch processing patterns
- Error handling in loops

**Use Case:** Batch notification system that processes users in batches with retry logic for failures.

---

### 5. Agentic Workflow (`05-agentic-workflow.yaml`)
**Demonstrates:**
- AI/agentic task execution
- MCP server integration
- Multiple AI models (Claude, GPT-4)
- Parallel AI analysis tasks
- Human review for high-risk scenarios
- Complex multi-step AI pipeline

**Use Case:** AI-powered customer feedback analysis with sentiment analysis, topic extraction, and insight generation.

---

### 6. Error Handling and Join Patterns (`06-error-handling-joins.yaml`)
**Demonstrates:**
- Error handling via conditional branching
- Join patterns (waiting for multiple parallel branches)
- Workflow-level variables
- Secret management and references
- Fallback strategies for failed tasks
- Partial success handling
- Multi-source data synchronization

**Use Case:** Multi-source data sync with comprehensive error handling, fallback mechanisms, and join patterns for coordinating parallel fetches.

**Key Features:**
- **Variables**: Workflow-level configuration values (`maxRetries`, `batchSize`, `syncTimeout`)
- **Secrets**: Secure credential references for databases, APIs, and cloud storage
- **Join Pattern**: Waits for all parallel source fetches (`fetch_database`, `fetch_api`, `fetch_s3`) with timeout handling
- **Error Routing**: Each source has conditional error handling:
  - Retryable errors → log and continue with partial data
  - Non-retryable errors → fail workflow or use fallback
  - Missing data → skip gracefully
- **Fallback APIs**: If primary API fails, switches to fallback endpoint
- **Partial Success**: Merges data from successful sources even if some fail
- **Threshold Validation**: Checks if enough data was collected before proceeding

---

## Schema Features Demonstrated

| Feature | Example(s) |
|---------|------------|
| **Triggers** | |
| - Manual | 1, 6 |
| - Scheduled (cron) | 2, 5 |
| - Scheduled (interval) | 4 |
| - Event-driven | 3 |
| **Execution Patterns** | |
| - Sequential | 1, 3, 4, 5, 6 |
| - Parallel | 2, 5, 6 |
| - Conditional | 3, 5, 6 |
| - Loops (forEach) | 4 |
| - Loops (while) | 4 |
| - Join | 6 |
| **Activity Types** | |
| - Task (API) | 1, 2, 3, 5, 6 |
| - Task (Script) | 1, 2, 4, 6 |
| - Task (Connector) | 1, 2, 4, 5, 6 |
| - Task (Agentic) | 5 |
| - Human Approval | 3, 5 |
| **Resilience** | |
| - Timeouts | All |
| - Retry policies | All |
| - Exponential backoff | 1, 2, 5, 6 |
| - Fixed backoff | 1, 6 |
| - Linear backoff | 2, 6 |
| - Error handling via conditions | 6 |
| - Fallback strategies | 6 |
| **Data Flow** | |
| - Input parameters | All |
| - Output mapping | All |
| - Expression syntax | 3, 4, 5, 6 |
| - Secret references | 1, 3, 5, 6 |
| - Workflow variables | 6 |
| - Join output aggregation | 6 |

---

## ⚠️ Important Notice: Deprecated Retry Error Syntax

**Some examples in this directory use an outdated syntax** for the `retryableErrors` field that is **no longer functional**.

### Legacy Syntax (Deprecated - Not Functional)

Examples `01-simple-sequential.yaml`, `04-looping.yaml`, and `06-error-handling-joins.yaml` contain:

```yaml
retryPolicy:
  retryableErrors:
    - NETWORK_ERROR      # ❌ String-based error types (never worked)
    - TIMEOUT           # ❌ String-based error types (never worked)
    - RATE_LIMIT        # ❌ String-based error types (never worked)
```

**Status**: This syntax was never implemented and has no effect on retry behavior.

### Current Syntax (Functional)

The current workflow engine uses **integer error codes** with a whitelist approach:

```yaml
retryPolicy:
  retryableErrors:
    - 408  # ✅ Request Timeout (HTTP status code)
    - 429  # ✅ Too Many Requests (HTTP status code)
    - 500  # ✅ Internal Server Error (HTTP status code)
    - 503  # ✅ Service Unavailable (HTTP status code)
```

Or use defaults by omitting the field:
```yaml
retryPolicy:
  maxAttempts: 3
  backoff: exponential
  # retryableErrors not specified - uses defaults: [408, 429, 500, 502, 503, 504]
```

### Migration Resources

For production workflows, please refer to:
- [Migration Guide](../../../../../docs/migrations/retryable-errors-string-to-int.md) - How to migrate from string to integer error codes
- [Retry Policies](../../../../../docs/workflow-engine/retry-policies.md) - Complete retry policy documentation
- [Workflow Definition Guide](../../../../../docs/workflow-engine/workflow-definition-guide.md) - Examples with current syntax

These example files are kept unchanged for historical reference. The deprecated `retryableErrors` values can be ignored or updated to use integer codes when adapting these examples.

---

## Validating Examples

To validate these examples against the schema, you can use a JSON Schema validator with YAML support:

```bash
# Using ajv-cli (install with: npm install -g ajv-cli)
ajv validate -s ../workflow-definition.schema.json -d 01-simple-sequential.yaml

# Or use Python with jsonschema and pyyaml
python -c "
import yaml
import jsonschema

with open('../workflow-definition.schema.json') as sf:
    schema = yaml.safe_load(sf)

with open('01-simple-sequential.yaml') as wf:
    workflow = yaml.safe_load(wf)

jsonschema.validate(workflow, schema)
print('✓ Valid')
"
```

---

## Expression Syntax

The examples use a template expression syntax for dynamic values:

- `${input.paramName}` - Reference workflow input parameters
- `${activityId.output.fieldName}` - Reference output from previous activities
- `${metadata.name}` - Reference workflow metadata
- `${workflow.startTime}` - Reference workflow runtime properties
- `${secrets.secretName.secretId}` - Reference stored secrets/credentials
- `${variables.variableName}` - Reference workflow-level variables

Conditional expressions support standard operators:
- Comparison: `>`, `<`, `>=`, `<=`, `==`, `!=`
- Logical: `&&`, `||`, `!`
- Examples: `${input.amount > 1000}`, `${status == 'success' && count > 0}`

---

## Best Practices Illustrated

1. **Activity-level timeouts**: Each activity has appropriate timeout based on expected execution time
2. **Retry policies**: Configure retries with appropriate backoff strategies
3. **Error handling**: Use conditional logic for error routing and recovery (Example 6)
4. **Human-in-the-loop**: Include approval steps for high-risk operations (Examples 3, 5)
5. **Parallel execution**: Run independent tasks in parallel to reduce total execution time (Examples 2, 5, 6)
6. **Join patterns**: Coordinate multiple parallel branches with explicit wait conditions (Example 6)
7. **Output mapping**: Explicitly map outputs for use in downstream activities
8. **Secret management**: Reference secrets rather than hardcoding credentials (Examples 1, 3, 5, 6)
9. **Workflow variables**: Use variables for configuration values that don't change during execution (Example 6)
10. **Fallback strategies**: Implement fallback mechanisms for critical external dependencies (Example 6)
11. **Partial success handling**: Continue workflow execution even when some tasks fail (Example 6)

---

## Next Steps

- Review each example to understand different workflow patterns
- Modify examples to fit your specific use cases
- Test examples in the workflow engine
- Combine patterns to create complex workflows
- Refer to the JSON schema for complete field reference
