import { describe, expect, it } from 'vitest'

import { createConnectorActivity } from './useWorkflowStore'

describe('createConnectorActivity', () => {
  it('creates basic connector activity with required fields', () => {
    const activity = createConnectorActivity(
      'activity_123',
      'Test Activity',
      'ansible-automation-platform',
      'launch_job'
    )

    // Backend workaround: stored as 'agentic' executor with metadata
    expect(activity).toMatchObject({
      type: 'task',
      id: 'activity_123',
      name: 'Test Activity',
      metadata: {
        __executorType: 'aap',
        __connectorId: 'ansible-automation-platform',
      },
      task: {
        executor: 'agentic',
        config: {
          agent: '__connector_workaround__',
          prompt: expect.stringContaining('ansible-automation-platform'),
        },
      },
    })

    // Verify the connector data is properly encoded in the prompt
    const promptData = JSON.parse(activity.task.config.prompt)
    expect(promptData).toEqual({
      __type: 'connector',
      connectorId: 'ansible-automation-platform',
      operation: 'launch_job',
    })
  })

  it('parses and includes valid JSON parameters', () => {
    const params = JSON.stringify({ job_template_id: '42', extra_vars: { env: 'prod' } })
    const activity = createConnectorActivity('id', 'name', 'connector', 'operation', params)

    const promptData = JSON.parse(activity.task.config.prompt)
    expect(promptData.parameters).toEqual({
      job_template_id: '42',
      extra_vars: { env: 'prod' },
    })
  })

  it('omits parameters when empty or invalid JSON', () => {
    const emptyActivity = createConnectorActivity('id', 'name', 'connector', 'op', '')
    const invalidActivity = createConnectorActivity('id', 'name', 'connector', 'op', '{bad json}')

    const emptyPrompt = JSON.parse(emptyActivity.task.config.prompt)
    const invalidPrompt = JSON.parse(invalidActivity.task.config.prompt)

    expect(emptyPrompt).not.toHaveProperty('parameters')
    expect(invalidPrompt).not.toHaveProperty('parameters')
  })

  it('includes requiresApproval only when true', () => {
    const withApproval = createConnectorActivity('id', 'name', 'connector', 'op', undefined, true)
    const withoutApproval = createConnectorActivity('id', 'name', 'connector', 'op', undefined, false)

    expect(withApproval.requiresApproval).toBe(true)
    expect(withoutApproval).not.toHaveProperty('requiresApproval')
  })

  it('supports all AAP operations', () => {
    const operations = ['launch_job', 'launch_workflow', 'get_job_status', 'cancel_job']

    operations.forEach((op) => {
      const activity = createConnectorActivity('id', 'name', 'ansible-automation-platform', op)
      const promptData = JSON.parse(activity.task.config.prompt)
      expect(promptData.operation).toBe(op)
    })
  })

  it('creates complete real-world activity', () => {
    const activity = createConnectorActivity(
      'activity_deploy_prod',
      'Deploy Production',
      'ansible-automation-platform',
      'launch_job',
      '{"job_template_id": "42", "inventory": "production"}',
      true
    )

    expect(activity).toMatchObject({
      type: 'task',
      id: 'activity_deploy_prod',
      name: 'Deploy Production',
      requiresApproval: true,
      metadata: {
        __executorType: 'aap',
        __connectorId: 'ansible-automation-platform',
      },
      task: {
        executor: 'agentic',
        config: {
          agent: '__connector_workaround__',
        },
      },
    })

    // Verify the connector data is properly encoded in the prompt
    const promptData = JSON.parse(activity.task.config.prompt)
    expect(promptData).toEqual({
      __type: 'connector',
      connectorId: 'ansible-automation-platform',
      operation: 'launch_job',
      parameters: {
        job_template_id: '42',
        inventory: 'production',
      },
    })
  })
})
