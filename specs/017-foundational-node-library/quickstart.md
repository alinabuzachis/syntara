# Quickstart: AAP Job Template Executor

**Feature**: Foundational Node Library Updates
**Date**: 2025-12-01
**Spec**: [spec.md](./spec.md)

## Overview

This quickstart demonstrates using the AAP Job Template executor to launch Ansible Automation Platform job templates from workflows. It covers basic usage, configuration options, and validation of deprecated features.

## Prerequisites

- AAP Controller instance accessible via API
- Valid AAP authentication credentials (username/password or token)
- At least one configured job template in AAP
- Nexus workflow engine running with AAP client configured

## Example 1: Basic AAP Job Template Execution

### Workflow Definition

```yaml
# workflows/aap-deploy-app.yaml
name: Deploy Application via AAP
description: Launch AAP job template to deploy application

triggers:
  - type: manual

tasks:
  - name: deploy_to_production
    executor: aap_job_template
    config:
      job_template_id: 42
      inventory_name: "Production Servers"
      organization_name: "Operations"
      extra_vars:
        app_version: "2.1.0"
        deploy_environment: "production"
      tags: "deploy,configure"
      verbosity: 1
```

### Expected Behavior

1. Workflow triggers manually via API: `POST /api/v1/executions`
2. AAP job template #42 launches with specified inventory name (resolved to ID) and extra vars
3. Activity polls job status every 5 seconds until completion
4. Job output captured and available to subsequent tasks
5. Workflow completes when job finishes

### Validation Steps

```bash
# 1. Create workflow (returns workflow_id in response)
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Content-Type: application/yaml" \
  --data-binary @workflows/aap-deploy-app.yaml

# 2. Execute workflow (use workflow_id from step 1 response)
curl -X POST http://localhost:8000/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "<workflow-id-from-step-1>"}'

# 3. Check execution status (use execution_id from step 2 response)
curl http://localhost:8000/api/v1/executions/{execution_id}

# 4. Verify in AAP
# - Check AAP UI for launched job
# - Verify inventory and extra vars passed correctly
# - Confirm job completed successfully
```

## Example 2: Multi-Step Workflow with AAP and Scripts

### Workflow Definition

```yaml
# workflows/aap-with-validation.yaml
name: AAP Deployment with Pre/Post Validation
description: Validates before deployment, deploys via AAP, validates after

triggers:
  - type: manual

tasks:
  - name: pre_deployment_check
    executor: script
    config:
      language: python
      code: |
        # Pre-deployment validation
        import requests
        response = requests.get('https://api.example.com/health')
        assert response.status_code == 200, "Service not healthy"
        print("Pre-deployment check passed")

  - name: deploy_application
    executor: aap_job_template
    config:
      job_template_id: 42
      inventory_name: "Production Servers"
      organization_name: "Operations"
      extra_vars:
        app_version: "${workflow.inputs.version}"
        previous_version: "${pre_deployment_check.output.current_version}"
      limit: "${workflow.inputs.target_hosts}"
      verbosity: 2

  - name: post_deployment_validation
    executor: script
    config:
      language: bash
      code: |
        #!/bin/bash
        # Verify deployment success
        JOB_STATUS="${deploy_application.status}"
        if [ "$JOB_STATUS" != "successful" ]; then
          echo "Deployment failed with status: $JOB_STATUS"
          exit 1
        fi

        # Run smoke tests
        curl -f https://api.example.com/version | grep "${workflow.inputs.version}"
```

### Expected Behavior

1. Pre-deployment script validates service health
2. AAP job template launches with dynamic parameters from workflow inputs
3. Post-deployment script validates deployment success
4. Workflow fails if any step fails (automatic rollback trigger)

### Validation Steps

```bash
# Execute with input parameters (use workflow_id from workflow creation)
curl -X POST http://localhost:8000/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "<workflow-id-from-creation>",
    "input_data": {
      "version": "2.1.0",
      "target_hosts": "web-*.prod.example.com"
    }
  }'
```

## Example 3: Converge Activity for Parallel Workflows

```yaml
# workflows/valid-converge.yaml
name: Parallel Workflow with Converge
description: Demonstrates converge activity for synchronizing parallel branches

tasks:
  - name: parallel_1
    executor: script
    config:
      language: python
      code: "print('task 1')"

  - name: parallel_2
    executor: script
    config:
      language: python
      code: "print('task 2')"

  - name: synchronize
    type: converge
    converge_type: ALL  # Only ALL type supported (ANY/Majority/Count removed)
    branches:
      - parallel_1
      - parallel_2

  - name: after_sync
    executor: script
    config:
      language: python
      code: "print('both tasks complete')"
```

## Example 4: Error Handling

### Workflow with AAP Job Failure

```yaml
# workflows/aap-with-error-handling.yaml
name: AAP Job with Error Handling
description: Demonstrates error handling for failed AAP jobs

tasks:
  - name: risky_deployment
    executor: aap_job_template
    config:
      job_template_id: 99
      inventory_name: "Staging Servers"
      organization_name: "Operations"
      extra_vars:
        force_deploy: true
    retry_policy:
      max_attempts: 3
      initial_interval: 10s
      backoff_coefficient: 2.0

  - name: rollback_on_failure
    executor: aap_job_template
    config:
      job_template_id: 100  # Rollback playbook
      inventory_name: "Staging Servers"
      organization_name: "Operations"
    condition: "${risky_deployment.status == 'failed'}"
```

### Expected Behavior

1. `risky_deployment` task attempts AAP job
2. If job fails, Temporal retries up to 3 times with exponential backoff
3. After all retries exhausted, `rollback_on_failure` task executes
4. Rollback job template runs to restore previous state

## Test Scenarios

### Scenario 1: Successful AAP Job Execution

**Given**: Valid AAP job template ID and configuration
**When**: Workflow executes
**Then**:
- Job launches in AAP successfully
- Activity polls job status until completion
- Job output captured in workflow state
- Subsequent tasks can access job results

**Verification**:
```python
# In post-deployment task
assert ${deploy_application.status} == "successful"
assert ${deploy_application.job_id} > 0
assert len(${deploy_application.output}) > 0
```

### Scenario 2: AAP Job Failure

**Given**: AAP job template that will fail (invalid playbook, etc.)
**When**: Workflow executes
**Then**:
- Job launches and fails in AAP
- Activity captures failure status
- Workflow error handling triggered
- Error details available for debugging

**Verification**:
```python
# Check error handling
assert ${deploy_application.status} in ["failed", "error"]
assert "error" in ${deploy_application.output}.lower()
```

### Scenario 3: AAP Connection Failure

**Given**: AAP API unavailable (network issue, auth failure, etc.)
**When**: Workflow attempts to launch job
**Then**:
- Activity raises connection error
- Temporal retry policy applied
- After max retries, workflow fails with clear error message

**Expected Error**:
```
Activity execution failed: Failed to connect to AAP API at https://aap.example.com.
Check AAP connectivity and credentials.
```

## Configuration Reference

### AAP Executor Config Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `executor` | string | Yes | Must be "aap_job_template" | `"aap_job_template"` |
| `job_template_id` | integer | Either ID or name | AAP job template ID | `42` |
| `job_template_name` | string | Either ID or name | AAP job template name (requires organization_name) | `"Deploy App"` |
| `organization_name` | string | When using names | AAP organization name | `"Operations"` |
| `inventory_id` | integer | No | Override inventory by ID | `123` |
| `inventory_name` | string | No | Override inventory by name (requires organization_name) | `"Production Servers"` |
| `credentials` | array | No | List of credential IDs | `[1, 2, 3]` |
| `extra_vars` | object | No | Extra variables for job | `{"version": "1.2.3"}` |
| `limit` | string | No | Host pattern to limit execution | `"web-*.prod"` |
| `tags` | string | No | Ansible tags to run | `"deploy,configure"` |
| `skip_tags` | string | No | Ansible tags to skip | `"backup"` |
| `verbosity` | integer | No | Job verbosity level (0-5) | `2` |

### Environment Configuration

```bash
# AAP Connection Settings (required)
NEXUS_AAP_BASE_URL=https://aap.example.com
NEXUS_AAP_USERNAME=workflow_user
NEXUS_AAP_PASSWORD=secret_password
# OR use token authentication instead
NEXUS_AAP_TOKEN=your_api_token
```

**Timeout Configuration**: Configure timeout per-activity at the activity level:

```yaml
tasks:
  - name: long_running_job
    executor: aap_job_template
    timeout: "PT2H"  # 2 hours for this specific job (ISO 8601 duration)
    config:
      job_template_id: 123
      inventory_name: "Production Servers"
      organization_name: "Operations"
```

## Troubleshooting

### Issue: "AAP job template not found"

**Cause**: Invalid `job_template_id` or insufficient permissions

**Solution**:
1. Verify job template exists in AAP UI
2. Check AAP credentials have permission to view/launch template
3. Use AAP API to list available templates:
   ```bash
   curl -H "Authorization: Bearer $AAP_TOKEN" \
     https://aap.example.com/api/v2/job_templates/
   ```

### Issue: "Job status stuck in 'pending'"

**Cause**: AAP queue full or no available execution capacity

**Solution**:
1. Check AAP capacity in UI (Settings → System)
2. Check AAP job queue for backlog
3. Increase activity timeout if jobs normally take >1 hour
4. Consider using activity heartbeat for very long jobs

### Issue: "Validation error: language 'ansible' not supported"

**Cause**: Attempting to use deprecated Ansible playbook script executor

**Solution**:
- Use AAP job template executor instead
- Create job template in AAP with your playbook
- Replace script task with aap_job_template task

**Before (deprecated)**:
```yaml
executor: script
config:
  language: ansible
  code: |
    - hosts: all
      tasks:
        - debug: msg="hello"
```

**After (correct)**:
```yaml
executor: aap_job_template
config:
  job_template_id: 123  # Template containing your playbook
```

## Next Steps

1. Review generated data model: [data-model.md](./data-model.md)
2. Review implementation plan: [plan.md](./plan.md)
3. Run `/tasks` command to generate implementation tasks
4. Begin TDD implementation following tasks.md
