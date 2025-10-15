# Quickstart Guide: Workflow Engine

This guide demonstrates the core workflow engine functionality through practical examples that validate the user stories from the feature specification.

## Prerequisites

- Workflow Engine API running on `http://localhost:8000`
- Valid JWT token for authentication
- External agentic tool server (MCP) available for testing

## Discovery: List Available Activity Types

Before creating workflows, you can discover what activity executor types are available:

```bash
curl -X GET http://localhost:8000/api/v1/activity-types \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "activity_types": [
    {
      "type": "agentic",
      "name": "Agentic Tool Execution",
      "description": "Execute tasks using external agentic tool servers (MCP) with AI model integration",
      "config_schema": {
        "type": "object",
        "required": ["agent", "tools", "model"],
        "properties": {
          "agent": {
            "type": "string",
            "description": "MCP server URI",
            "pattern": "^mcp://.+"
          },
          "tools": {
            "type": "array",
            "description": "List of tool names to invoke"
          },
          "model": {
            "type": "string",
            "enum": ["claude-3-opus", "claude-3-sonnet", "gpt-4", "gpt-4-turbo"]
          }
        }
      },
      "examples": [
        {
          "name": "Sentiment Analysis",
          "description": "Analyze text sentiment using MCP tool",
          "config": {
            "agent": "mcp://sentiment-server",
            "tools": ["analyze_sentiment"],
            "model": "claude-3-opus"
          }
        }
      ]
    },
    {
      "type": "connector",
      "name": "Connector Execution",
      "description": "Execute tasks using registered connectors for databases, APIs, and enterprise systems",
      "config_schema": {
        "type": "object",
        "required": ["connectorId", "operation"],
        "properties": {
          "connectorId": {
            "type": "string",
            "description": "Registered connector ID"
          },
          "operation": {
            "type": "string",
            "description": "Operation to perform"
          }
        }
      }
    },
    {
      "type": "script",
      "name": "Script Execution",
      "description": "Execute custom scripts in Python, JavaScript, or other languages",
      "config_schema": {
        "type": "object",
        "required": ["language", "code"],
        "properties": {
          "language": {
            "type": "string",
            "enum": ["python", "javascript", "bash"]
          },
          "code": {
            "type": "string",
            "description": "Script code to execute"
          }
        }
      }
    },
    {
      "type": "api",
      "name": "HTTP API Execution",
      "description": "Make HTTP requests to external APIs",
      "config_schema": {
        "type": "object",
        "required": ["method", "url"],
        "properties": {
          "method": {
            "type": "string",
            "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]
          },
          "url": {
            "type": "string",
            "format": "uri"
          }
        }
      }
    }
  ]
}
```

## User Story 1: Create and Execute Simple Workflow (Non-technical user, 30 minutes)

### Step 1: Create a Simple Workflow

First, create a workflow definition file `simple-data-processing.yaml`:

```yaml
schemaVersion: "1.0.0"
version: 1

metadata:
  name: simple-data-processing
  description: Process customer data with external tool
  tags: [example, quickstart]

triggers:
- type: manual

workflow:
  activities:
  - id: fetch_data
    name: Fetch Data
    type: task
    task:
      executor: connector
      config:
        connectorId: customer-db
        operation: query
        parameters:
          query: SELECT * FROM customers WHERE status = 'active'
      outputs:
        customers: $.rows

  - id: process_data
    name: Process Data
    type: task
    task:
      executor: agentic
      config:
        agent: mcp://data-processor-server
        tools:
        - process_customer_data
        model: claude-3-opus
        prompt: Process the customer data and standardize the format
      inputs:
        customerData: ${fetch_data.output.customers}
      outputs:
        processedData: $.result

  - id: store_results
    name: Store Results
    type: task
    task:
      executor: connector
      config:
        connectorId: results-db
        operation: insert
        parameters:
          table: processed_customers
          data: ${process_data.output.processedData}
```

Then submit the workflow:

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "simple-data-processing",
  "description": "Process customer data with external tool",
  "workflow_definition": $(cat simple-data-processing.yaml | jq -Rs .)
}
EOF
```

**Expected Response:**
```json
{
  "id": "workflow-uuid",
  "name": "simple-data-processing",
  "status": "active",
  "version": 1,
  "created_at": "2025-09-29T10:00:00Z"
}
```

**Optional: Update workflow metadata without creating new version**

```bash
curl -X PATCH http://localhost:8000/api/v1/workflows/workflow-uuid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "is_enabled": true
  }'
```

### Step 2: Execute the Workflow

```bash
curl -X POST http://localhost:8000/api/v1/executions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "workflow-uuid",
    "input_data": {
      "batch_size": 100,
      "priority": "normal"
    }
  }'
```

**Expected Response:**
```json
{
  "id": "execution-uuid",
  "workflow_id": "workflow-uuid",
  "status": "running",
  "started_at": "2025-09-29T10:05:00Z",
  "current_activities": [
    {
      "activity_name": "fetch_data",
      "temporal_activity_id": "temporal-id-1",
      "iteration": 1
    }
  ]
}
```

### Step 3: Monitor Execution Status

**Option A: Polling (standard JSON response)**
```bash
curl -X GET http://localhost:8000/api/v1/executions/execution-uuid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Option B: Streaming (real-time updates)**
```bash
curl -X GET http://localhost:8000/api/v1/executions/execution-uuid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Accept: text/event-stream"
```

**Expected Streaming Events:**
```
event: execution_update
data: {"id": "execution-uuid", "status": "running", "current_activities": [{"activity_name": "fetch_data"}]}

event: execution_update
data: {"id": "execution-uuid", "status": "running", "current_activities": [{"activity_name": "process_data"}]}

event: execution_update
data: {"id": "execution-uuid", "status": "running", "current_activities": [{"activity_name": "store_results"}]}

event: execution_update
data: {"id": "execution-uuid", "status": "completed", "current_activities": []}
```

**Expected Timeline:**
- **T+0**: Status `running`, current activity: `fetch_data`
- **T+30s**: Status `running`, current activity: `process_data`
- **T+60s**: Status `running`, current activity: `store_results`
- **T+90s**: Status `completed`, no current activities

**Success Criteria:** ✅ Workflow created and executed within 30 minutes of API interaction

## User Story 2: Human Approval Workflow

### Step 1: Create Approval Workflow

First, create a workflow definition file `expense-approval.yaml`:

```yaml
schemaVersion: "1.0.0"
version: 1

metadata:
  name: expense-approval
  description: Simple expense approval workflow with human-in-the-loop
  tags: [example, quickstart]

triggers:
- type: manual

workflow:
  activities:
  - id: validate_expense
    name: Validate Expense
    type: task
    task:
      executor: connector
      config:
        connectorId: expense-validator-uuid
        operation: validate
        parameters:
          validation_type: expense
      outputs:
        validationResult: $.result
        isValid: $.is_valid

  - id: manager_approval
    name: Manager Approval
    type: task
    requiresApproval: true
    approval:
      approvers:
      - manager
      prompt: Please review and approve this expense request
      timeout: PT24H
      onTimeout: reject
    task:
      executor: script
      config:
        language: python
        code: |
          print('{"approval_status": "approved"}')
      outputs:
        approvalStatus: $.approval_status

  - id: process_payment
    name: Process Payment
    type: task
    task:
      executor: connector
      config:
        connectorId: payment-processor-uuid
        operation: processPayment
        parameters:
          payment_method: wire_transfer
      inputs:
        expenseData: ${validate_expense.output.validationResult}
        approvalData: ${manager_approval.output.approvalStatus}
      outputs:
        paymentId: $.payment_id
        transactionStatus: $.status
```

Then submit the workflow:

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "expense-approval-workflow",
  "workflow_definition": $(cat expense-approval.yaml | jq -Rs .)
}
EOF
```

### Step 2: Execute Approval Workflow

```bash
curl -X POST http://localhost:8000/api/v1/executions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "approval-workflow-uuid",
    "input_data": {
      "expense_amount": 500.00,
      "category": "travel",
      "employee_id": "emp-123"
    }
  }'
```

### Step 3: Wait for Approval Request

Monitor execution - it will remain in `running` status while waiting for approval:

```bash
curl -X GET http://localhost:8000/api/v1/executions/execution-uuid
```

**Expected Response (waiting for approval):**
```json
{
  "id": "execution-uuid",
  "status": "running",
  "current_activities": [
    {
      "activity_name": "manager_approval",
      "temporal_activity_id": "temporal-id-2",
      "iteration": 1
    }
  ]
}
```

### Step 4: Check Pending Approvals

```bash
curl -X GET http://localhost:8000/api/v1/approvals?status=pending \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Step 5: Approve the Request

```bash
curl -X PATCH http://localhost:8000/api/v1/approvals/approval-uuid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "response_data": {
      "reason": "Expense is within policy limits and properly documented",
      "reviewed_by": "manager",
      "review_date": "2025-10-02"
    }
  }'
```

### Step 6: Verify Workflow Continuation

Check that execution resumes and completes:

```bash
curl -X GET http://localhost:8000/api/v1/executions/execution-uuid
```

**Success Criteria:**
- ✅ Workflow pauses at approval step
- ✅ Approval notification sent through UI
- ✅ Workflow resumes after approval
- ✅ Human approver can provide reason for decision

## User Story 3: Nexus Integration (YAML from External Service)

### Step 1: Simulate Nexus YAML Generation

First, create the Nexus-generated workflow file `nexus-workflow.yaml`:

```yaml
# Generated by Nexus v1.0
schemaVersion: "1.0.0"
version: 1

metadata:
  name: nexus-generated-workflow
  description: Workflow automatically generated by Nexus service
  tags: [nexus, auto-generated]

triggers:
- type: manual

workflow:
  activities:
  - id: analyze_requirements
    name: Analyze Requirements
    type: task
    task:
      executor: agentic
      config:
        agent: mcp://analysis-server
        tools:
        - requirement_analyzer
        model: claude-3-opus
        prompt: Analyze requirements with comprehensive depth
      outputs:
        result: $.analysis_result
        confidence: $.confidence_score

  - id: generate_solution
    name: Generate Solution
    type: task
    task:
      executor: agentic
      config:
        agent: mcp://solution-server
        tools:
        - solution_generator
        model: gpt-4
        prompt: |
          Generate solution based on requirements analysis.
          Requirements: ${analyze_requirements.output.result}
      inputs:
        requirements: ${analyze_requirements.output.result}
      outputs:
        solution: $.generated_solution
        solutionType: $.solution_type

  - id: validate_solution
    name: Validate Solution
    type: task
    requiresApproval: true
    approval:
      approvers:
      - product-manager
      prompt: Please review and validate the generated solution
      timeout: PT4H
      onTimeout: reject
    task:
      executor: script
      config:
        language: python
        code: |
          print('{"validation_status": "validated"}')
      outputs:
        validationStatus: $.validation_status
```

Then submit to the API:

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "nexus-generated-workflow",
  "description": "Workflow automatically generated by Nexus service",
  "workflow_definition": $(cat nexus-workflow.yaml | jq -Rs .)
}
EOF
```

### Step 2: Validate YAML Schema

The API should automatically validate the YAML against the workflow schema.

**Expected Response:**
```json
{
  "id": "nexus-workflow-uuid",
  "name": "nexus-generated-workflow",
  "status": "active",
  "workflow_definition": "...",
  "validation_status": "passed"
}
```

### Step 3: Retrieve Workflow with Version

Get the current version (latest):

```bash
curl -X GET http://localhost:8000/api/v1/workflows/nexus-workflow-uuid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Get a specific version:

```bash
curl -X GET "http://localhost:8000/api/v1/workflows/nexus-workflow-uuid?version=1" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "id": "nexus-workflow-uuid",
  "name": "nexus-generated-workflow",
  "current_version": 1,
  "is_enabled": true,
  "version": {
    "version": 1,
    "schema_version": "1.0.0",
    "workflow_definition": "...",
    "schedule_config": null,
    "created_at": "2025-10-02T10:00:00Z",
    "change_description": "Initial version"
  }
}
```

### Step 4: Execute Nexus Workflow

```bash
curl -X POST http://localhost:8000/api/v1/executions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "nexus-workflow-uuid",
    "input_data": {
      "project_requirements": "Build a customer portal with authentication"
    }
  }'
```

**Success Criteria:**
- ✅ YAML definition automatically validated
- ✅ Workflow executes without manual intervention
- ✅ External MCP tools integrated successfully
- ✅ Can retrieve specific workflow versions

## User Story 4: Multi-Workflow Monitoring

### Step 1: Create Multiple Concurrent Workflows

Execute the previous workflows simultaneously:

```bash
# Start 3 different workflows
for i in {1..3}; do
  curl -X POST http://localhost:8000/api/v1/executions \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"workflow_id\": \"workflow-uuid\", \"input_data\": {\"batch_id\": $i}}"
done
```

### Step 2: Monitor All Executions

Query executions by workflow ID:

```bash
curl -X GET "http://localhost:8000/api/v1/executions?workflow_id=workflow-uuid&limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "executions": [
    {
      "id": "exec-1",
      "status": "running",
      "current_activities": [...]
    },
    {
      "id": "exec-2",
      "status": "completed",
      "current_activities": []
    },
    {
      "id": "exec-3",
      "status": "running",
      "current_activities": [{"activity_name": "pending_approval", "status": "pending"}]
    }
  ],
  "total": 3
}
```

**Success Criteria:**
- ✅ Unified dashboard shows all workflow statuses
- ✅ Real-time status updates visible
- ✅ Can distinguish between different execution states

## User Story 5: External Tool Integration

### Step 1: Prerequisites

**Note:** MCP connectors are managed by the separate "MCP Server Integration and Tool Management" feature.
For this workflow, we assume a connector with ID `claude-code-mcp-uuid` has already been registered and is available.

### Step 2: Create Nexus Integration Workflow

Create a workflow definition file `code-analysis.yaml`:

```yaml
schemaVersion: "1.0.0"
version: 1

metadata:
  name: code-analysis-workflow
  description: Analyze codebase using MCP tools
  tags: [code-analysis, mcp, example]

triggers:
- type: manual

inputs:
  codebasePath:
    type: string
    description: Path to the codebase to analyze
    required: true
    default: /src

workflow:
  activities:
  - id: analyze_codebase
    name: Analyze Codebase
    type: task
    task:
      executor: agentic
      config:
        agent: mcp://claude-code-server
        tools:
        - code_analysis
        model: claude-3-opus
        prompt: |
          Analyze the Python codebase at ${input.codebasePath} for code quality issues.
          Provide a detailed report on:
          - Code smells
          - Security vulnerabilities
          - Performance issues
          - Best practice violations
      inputs:
        path: ${input.codebasePath}
      outputs:
        report: $.analysis_report
        score: $.quality_score
        issues: $.identified_issues
```

Then submit the workflow:

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "code-analysis-workflow",
  "workflow_definition": $(cat code-analysis.yaml | jq -Rs .)
}
EOF
```

**Success Criteria:**
- ✅ Workflow integrates with external MCP tool servers
- ✅ Agentic tasks can invoke MCP tools
- ✅ Standard interface for all external tools

## User Story 6: Error Handling and Recovery

### Step 1: Create Workflow with Failure Scenario

First, create a workflow definition file `failure-recovery.yaml`:

```yaml
schemaVersion: "1.0.0"
version: 1

metadata:
  name: failure-recovery-test
  description: Workflow with retry logic for error handling
  tags: [testing, retry, example]

triggers:
- type: manual

workflow:
  activities:
  - id: unstable_operation
    name: Unstable Operation
    type: task
    task:
      executor: connector
      config:
        connectorId: test-connector-uuid
        operation: testUnstableEndpoint
        parameters:
          failure_rate: 0.7
          simulate_transient_errors: true
      outputs:
        operationResult: $.result
        attemptCount: $.attempts
    retryPolicy:
      maxAttempts: 3
      backoff: exponential
      multiplier: 2
      initialInterval: PT1S
      maxInterval: PT1M
    timeout: PT5M

  - id: cleanup_operation
    name: Cleanup Operation
    type: task
    task:
      executor: connector
      config:
        connectorId: cleanup-service-uuid
        operation: cleanup
        parameters:
          cleanup_type: post_operation
      inputs:
        operationData: ${unstable_operation.output.operationResult}
      outputs:
        cleanupStatus: $.status
        cleanedResources: $.resources
```

Then submit the workflow:

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "failure-recovery-test",
  "workflow_definition": $(cat failure-recovery.yaml | jq -Rs .)
}
EOF
```

### Step 2: Execute and Monitor Retries

```bash
curl -X POST http://localhost:8000/api/v1/executions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "failure-workflow-uuid",
    "input_data": {}
  }'
```

Monitor the activity executions to see retry behavior:

```bash
curl -X GET http://localhost:8000/api/v1/executions/execution-uuid/activities
```

**Expected Response showing retries:**
```json
[
  {
    "activity_name": "unstable_operation",
    "status": "completed",
    "retry_count": 2,
    "error_details": "Connection failed on attempts 1 and 2"
  }
]
```

**Success Criteria:**
- ✅ Failed activities retry according to policy
- ✅ Execution state maintained during retries
- ✅ Workflow recovers from transient failures

## Real-time Monitoring with Streamable HTTP

### Step 1: Establish Streaming Connection

```bash
curl -X GET "http://localhost:8000/api/v1/stream/executions/execution-uuid?session_id=test-session" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Accept: text/event-stream"
```

**Expected Stream Events:**
```
id: event-1
event: activity_started
data: {"activity_name": "fetch_data", "timestamp": "2025-09-29T10:00:00Z"}

id: event-2
event: activity_completed
data: {"activity_name": "fetch_data", "output": {...}, "timestamp": "2025-09-29T10:00:30Z"}

id: event-3
event: workflow_completed
data: {"status": "completed", "timestamp": "2025-09-29T10:01:00Z"}
```

**Success Criteria:**
- ✅ Real-time updates stream to client
- ✅ Session management for reconnection
- ✅ Message replay after disconnection

## Performance Validation

### Step 1: Concurrent Execution Test

Execute 100 workflows simultaneously to test the 1000 concurrent jobs requirement:

```bash
for i in {1..100}; do
  curl -X POST http://localhost:8000/api/v1/executions \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"workflow_id\": \"test-workflow-uuid\", \"input_data\": {\"test_id\": $i}}" &
done
wait
```

### Step 2: Report Generation Test

Generate a compliance report and verify it completes within 5 minutes:

```bash
time curl -X GET "http://localhost:8000/api/v1/reports/compliance?from=2025-09-01&to=2025-09-29" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Success Criteria:**
- ✅ 1000+ concurrent workflows supported
- ✅ Reports generated within 5 minutes
- ✅ API responses under 200ms

## Completion Checklist

After running through this quickstart guide, verify:

- [ ] Non-technical users can create workflows in under 30 minutes
- [ ] Human approval workflows pause and resume correctly
- [ ] Nexus-generated YAML workflows execute automatically
- [ ] Multiple concurrent workflows visible in unified dashboard
- [ ] External MCP tool servers integrate successfully
- [ ] Failed workflows retry and recover appropriately
- [ ] Real-time updates stream via Streamable HTTP
- [ ] Performance requirements met (1000 jobs, <5min reports, <200ms API)

This quickstart guide validates all primary user stories and demonstrates the complete workflow engine functionality.
