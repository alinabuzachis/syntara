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

    expect(activity).toMatchObject({
      type: 'task',
      id: 'activity_123',
      name: 'Test Activity',
      task: {
        executor: 'connector',
        config: {
          connectorId: 'ansible-automation-platform',
          operation: 'launch_job',
        },
      },
    })
  })

  it('parses and includes valid JSON parameters', () => {
    const params = JSON.stringify({ job_template_id: '42', extra_vars: { env: 'prod' } })
    const activity = createConnectorActivity('id', 'name', 'connector', 'operation', params)

    expect(activity.task.config.parameters).toEqual({
      job_template_id: '42',
      extra_vars: { env: 'prod' },
    })
  })

  it('omits parameters when empty or invalid JSON', () => {
    const emptyActivity = createConnectorActivity('id', 'name', 'connector', 'op', '')
    const invalidActivity = createConnectorActivity('id', 'name', 'connector', 'op', '{bad json}')

    expect(emptyActivity.task.config).not.toHaveProperty('parameters')
    expect(invalidActivity.task.config).not.toHaveProperty('parameters')
  })

  it('supports all AAP operations', () => {
    const operations = ['launch_job', 'launch_workflow', 'get_job_status', 'cancel_job']

    operations.forEach((op) => {
      const activity = createConnectorActivity('id', 'name', 'ansible-automation-platform', op)
      expect(activity.task.config.operation).toBe(op)
    })
  })

  it('creates complete real-world activity', () => {
    const activity = createConnectorActivity(
      'activity_deploy_prod',
      'Deploy Production',
      'ansible-automation-platform',
      'launch_job',
      '{"job_template_id": "42", "inventory": "production"}'
    )

    expect(activity).toMatchObject({
      type: 'task',
      id: 'activity_deploy_prod',
      name: 'Deploy Production',
      task: {
        executor: 'connector',
        config: {
          connectorId: 'ansible-automation-platform',
          operation: 'launch_job',
          parameters: {
            job_template_id: '42',
            inventory: 'production',
          },
        },
      },
    })
  })
})
