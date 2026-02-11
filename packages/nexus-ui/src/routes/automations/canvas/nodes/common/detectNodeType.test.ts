import type { TaskActivity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { detectNodeType } from './detectNodeType'

describe('detectNodeType', () => {
  it('returns the executor type for a standard task', () => {
    const task = {
      type: 'task',
      id: 'task-1',
      name: 'Script Task',
      task: {
        executor: 'script',
        config: { language: 'python', code: 'print("hello")' },
      },
    } as TaskActivity

    const result = detectNodeType(task)

    expect(result.actualExecutor).toBe('script')
    expect(result.detectedExecutorType).toBeUndefined()
    expect(result.connectorData).toBeNull()
  })

  it('detects approval nodes from metadata', () => {
    const task = {
      type: 'task',
      id: 'approval-1',
      name: 'Approval',
      requiresApproval: true,
      approval: { approvers: ['admin@example.com'], prompt: 'Approve?' },
      metadata: { __executorType: 'approval' },
      task: {
        executor: 'script',
        config: { language: 'python', code: '' },
      },
    } as unknown as TaskActivity

    const result = detectNodeType(task)

    expect(result.actualExecutor).toBe('approval')
    expect(result.detectedExecutorType).toBe('approval')
  })

  it('detects approval nodes without metadata when requiresApproval and approval exist', () => {
    const task = {
      type: 'task',
      id: 'approval-1',
      name: 'Approval',
      requiresApproval: true,
      approval: { approvers: ['admin@example.com'], prompt: 'Approve?' },
      task: {
        executor: 'script',
        config: { language: 'python', code: '' },
      },
    } as unknown as TaskActivity

    const result = detectNodeType(task)

    expect(result.actualExecutor).toBe('approval')
    expect(result.detectedExecutorType).toBe('approval')
  })

  it('detects connector nodes from agentic executor with prompt', () => {
    const task = {
      type: 'task',
      id: 'conn-1',
      name: 'Connector',
      task: {
        executor: 'agentic',
        config: {
          agent: 'default',
          prompt: JSON.stringify({
            __type: 'connector',
            connectorId: 'slack',
            operation: 'send_message',
            parameters: { channel: '#general' },
          }),
        },
      },
    } as TaskActivity

    const result = detectNodeType(task)

    expect(result.connectorData).toEqual({
      connectorId: 'slack',
      operation: 'send_message',
      parameters: { channel: '#general' },
    })
  })

  it('detects AAP nodes from agentic executor with ansible connectorId', () => {
    const task = {
      type: 'task',
      id: 'aap-1',
      name: 'AAP Task',
      task: {
        executor: 'agentic',
        config: {
          agent: 'default',
          prompt: JSON.stringify({
            __type: 'connector',
            connectorId: 'ansible-automation-platform',
            operation: 'run_job',
          }),
        },
      },
    } as TaskActivity

    const result = detectNodeType(task)

    expect(result.actualExecutor).toBe('aap')
    expect(result.detectedExecutorType).toBe('aap')
  })

  it('handles invalid JSON in prompt gracefully', () => {
    const task = {
      type: 'task',
      id: 'agentic-1',
      name: 'Agentic',
      task: {
        executor: 'agentic',
        config: {
          agent: 'default',
          prompt: 'not valid json',
        },
      },
    } as TaskActivity

    const result = detectNodeType(task)

    expect(result.actualExecutor).toBe('agentic')
    expect(result.connectorData).toBeNull()
  })

  it('handles empty prompt gracefully', () => {
    const task = {
      type: 'task',
      id: 'agentic-1',
      name: 'Agentic',
      task: {
        executor: 'agentic',
        config: {
          agent: 'default',
          prompt: '',
        },
      },
    } as TaskActivity

    const result = detectNodeType(task)

    expect(result.actualExecutor).toBe('agentic')
  })

  it('respects metadata override over detected type', () => {
    const task = {
      type: 'task',
      id: 'task-1',
      name: 'Custom',
      metadata: { __executorType: 'custom' },
      task: {
        executor: 'script',
        config: { language: 'python', code: '' },
      },
    } as unknown as TaskActivity

    const result = detectNodeType(task)

    expect(result.actualExecutor).toBe('custom')
    expect(result.detectedExecutorType).toBe('custom')
  })

  it('returns api executor for API tasks', () => {
    const task = {
      type: 'task',
      id: 'api-1',
      name: 'API Call',
      task: {
        executor: 'api',
        config: { method: 'GET', url: 'https://api.example.com' },
      },
    } as TaskActivity

    const result = detectNodeType(task)

    expect(result.actualExecutor).toBe('api')
  })
})
