import type { TaskActivity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { detectNodeType, type TaskActivityWithMetadata } from './detectNodeType'

describe('detectNodeType', () => {
  const createBaseTask = (overrides: Partial<TaskActivity> = {}): TaskActivity => ({
    type: 'task',
    id: 'test-task-1',
    name: 'Test Task',
    task: {
      executor: 'script',
      config: {
        language: 'python',
        code: 'print("hello")',
      },
    },
    ...overrides,
  })

  describe('basic detection', () => {
    it('returns the executor type for a basic task', () => {
      const task = createBaseTask()
      const result = detectNodeType(task)

      expect(result).toEqual({
        detectedExecutorType: undefined,
        connectorData: null,
        actualExecutor: 'script',
      })
    })

    it('returns agentic executor for agentic tasks', () => {
      const task = createBaseTask({
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
            prompt: 'Do something',
          },
        },
      })
      const result = detectNodeType(task)

      expect(result.actualExecutor).toBe('agentic')
    })

    it('returns api executor for API tasks', () => {
      const task = createBaseTask({
        task: {
          executor: 'api',
          config: { method: 'GET', url: 'https://api.example.com' },
        },
      })
      const result = detectNodeType(task)

      expect(result.actualExecutor).toBe('api')
    })
  })

  describe('metadata override detection', () => {
    it('uses __executorType from metadata when present', () => {
      const task = createBaseTask() as TaskActivityWithMetadata
      task.metadata = { __executorType: 'custom-executor' }

      const result = detectNodeType(task)

      expect(result).toEqual({
        detectedExecutorType: 'custom-executor',
        connectorData: null,
        actualExecutor: 'custom-executor',
      })
    })
  })

  describe('approval node detection', () => {
    it('detects approval nodes from requiresApproval flag', () => {
      const task = createBaseTask({
        requiresApproval: true,
        approval: {
          approvers: ['admin'],
          prompt: 'Please approve',
        },
      })

      const result = detectNodeType(task)

      expect(result).toEqual({
        detectedExecutorType: 'approval',
        connectorData: null,
        actualExecutor: 'approval',
      })
    })

    it('does not detect approval without approval config', () => {
      const task = createBaseTask({
        requiresApproval: true,
        // No approval config
      })

      const result = detectNodeType(task)

      expect(result.detectedExecutorType).toBeUndefined()
      expect(result.actualExecutor).toBe('script')
    })

    it('metadata __executorType takes precedence over approval detection', () => {
      const task = createBaseTask({
        requiresApproval: true,
        approval: {
          approvers: ['admin'],
          prompt: 'Please approve',
        },
      }) as TaskActivityWithMetadata
      task.metadata = { __executorType: 'custom' }

      const result = detectNodeType(task)

      expect(result.detectedExecutorType).toBe('custom')
      expect(result.actualExecutor).toBe('custom')
    })
  })

  describe('connector node detection', () => {
    it('detects connector nodes from agentic prompt JSON', () => {
      const task = createBaseTask({
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
            prompt: JSON.stringify({
              __type: 'connector',
              connectorId: 'my-connector',
              operation: 'fetch',
              parameters: { url: 'https://example.com' },
            }),
          },
        },
      })

      const result = detectNodeType(task)

      expect(result.connectorData).toEqual({
        connectorId: 'my-connector',
        operation: 'fetch',
        parameters: { url: 'https://example.com' },
      })
      expect(result.actualExecutor).toBe('agentic')
    })

    it('detects AAP connector nodes', () => {
      const task = createBaseTask({
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
            prompt: JSON.stringify({
              __type: 'connector',
              connectorId: 'ansible-automation-platform',
              operation: 'run-job',
              parameters: { jobId: '123' },
            }),
          },
        },
      })

      const result = detectNodeType(task)

      expect(result.detectedExecutorType).toBe('aap')
      expect(result.actualExecutor).toBe('aap')
      expect(result.connectorData).toEqual({
        connectorId: 'ansible-automation-platform',
        operation: 'run-job',
        parameters: { jobId: '123' },
      })
    })

    it('detects AAP connector nodes with partial match', () => {
      const task = createBaseTask({
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
            prompt: JSON.stringify({
              __type: 'connector',
              connectorId: 'my-ansible-connector',
              operation: 'run',
            }),
          },
        },
      })

      const result = detectNodeType(task)

      expect(result.detectedExecutorType).toBe('aap')
    })

    it('does not detect AAP for non-ansible connectors', () => {
      const task = createBaseTask({
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
            prompt: JSON.stringify({
              __type: 'connector',
              connectorId: 'slack-connector',
              operation: 'post',
            }),
          },
        },
      })

      const result = detectNodeType(task)

      expect(result.detectedExecutorType).toBeUndefined()
      expect(result.actualExecutor).toBe('agentic')
    })
  })

  describe('edge cases', () => {
    it('handles invalid JSON in prompt gracefully', () => {
      const task = createBaseTask({
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
            prompt: 'not valid json {{{',
          },
        },
      })

      const result = detectNodeType(task)

      expect(result).toEqual({
        detectedExecutorType: undefined,
        connectorData: null,
        actualExecutor: 'agentic',
      })
    })

    it('handles empty prompt', () => {
      const task = createBaseTask({
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
            prompt: '',
          },
        },
      })

      const result = detectNodeType(task)

      expect(result.connectorData).toBeNull()
    })

    it('handles undefined prompt', () => {
      const task = createBaseTask({
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
          },
        },
      })

      const result = detectNodeType(task)

      expect(result.connectorData).toBeNull()
    })

    it('handles JSON without __type connector', () => {
      const task = createBaseTask({
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
            prompt: JSON.stringify({
              __type: 'something-else',
              data: 'value',
            }),
          },
        },
      })

      const result = detectNodeType(task)

      expect(result.connectorData).toBeNull()
    })

    it('metadata override takes precedence over AAP detection', () => {
      const task = createBaseTask({
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
            prompt: JSON.stringify({
              __type: 'connector',
              connectorId: 'ansible-automation-platform',
            }),
          },
        },
      }) as TaskActivityWithMetadata
      task.metadata = { __executorType: 'connector' }

      const result = detectNodeType(task)

      // Should use metadata override, not auto-detect AAP
      expect(result.detectedExecutorType).toBe('connector')
      expect(result.actualExecutor).toBe('connector')
    })
  })
})
