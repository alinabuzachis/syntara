import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NodeRegistry } from '../NodeRegistry'

vi.mock('../../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: vi.fn(() => ({
      addActivity: vi.fn(),
      addTrigger: vi.fn(),
      edges: [],
      batchAddActivitiesAndEdges: vi.fn(),
    })),
  },
  createManualTrigger: vi.fn(() => ({ type: 'manual_trigger' })),
  createScheduledTrigger: vi.fn(() => ({ type: 'scheduled' })),
  createWebhookTrigger: vi.fn(() => ({ type: 'webhook_trigger' })),
  createScriptActivity: vi.fn(() => ({ type: 'script' })),
  createApiActivity: vi.fn(() => ({ type: 'http_request' })),
  createAgenticActivity: vi.fn(() => ({ type: 'agentic' })),
  createApprovalActivity: vi.fn(() => ({ type: 'approval' })),
  createGenericActivity: vi.fn(() => ({ type: 'task' })),
  createConditionActivity: vi.fn(() => ({ type: 'condition' })),
  createConvergeActivity: vi.fn(() => ({ type: 'converge' })),
  createLoopActivity: vi.fn(() => ({ type: 'loop' })),
  createWaitActivity: vi.fn(() => ({ type: 'wait' })),
  createAAPJobTemplateActivity: vi.fn(() => ({ type: 'aap_job_template' })),
  createAAPWorkflowTemplateActivity: vi.fn(() => ({ type: 'aap_workflow_job_template' })),
}))

vi.mock('../../../../utils/jsonSafeParse', () => ({
  parseJsonSchema: vi.fn(),
}))

vi.mock('../../../../utils/webhookPath', () => ({
  normalizeWebhookPath: vi.fn((p: string) => p),
}))

vi.mock('../../utils/agentHelpers', () => ({
  parseToolsString: vi.fn(() => []),
}))

describe('registerAllNodes (index)', () => {
  beforeEach(() => {
    NodeRegistry.clear()
  })

  it('registers all workflow step types when called', async () => {
    const { registerAllNodes } = await import('./index')
    registerAllNodes()

    const allNodes = NodeRegistry.getAll()
    expect(allNodes.length).toBeGreaterThan(0)
  })

  it('registers expected node type ids', async () => {
    const { registerAllNodes } = await import('./index')
    registerAllNodes()

    expect(NodeRegistry.get('trigger')).toBeDefined()
    expect(NodeRegistry.get('action')).toBeDefined()
    expect(NodeRegistry.get('agent')).toBeDefined()
    expect(NodeRegistry.get('approval')).toBeDefined()
  })

  it('logs a warning for modules without a default export', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { registerAllNodes } = await import('./index')
    registerAllNodes()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('does not export a registration function as default')
    )

    consoleSpy.mockRestore()
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })
})
