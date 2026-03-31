import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildTriggerNodeId } from '../../utils/triggerNodeIds'

import { ExecutionViewContent } from './ExecutionViewContent'

const mockLoadWorkflowWithEdges = vi.fn()
const mockSetWorkflow = vi.fn()
const mockSetEdges = vi.fn()
const mockSetActivityExecutions = vi.fn()

vi.mock('../../stores/useWorkflowStore', () => ({
  useWorkflowStoreActions: () => ({
    loadWorkflowWithEdges: mockLoadWorkflowWithEdges,
    setWorkflow: mockSetWorkflow,
    setEdges: mockSetEdges,
  }),
}))

vi.mock('../automations/stores/useExecutionStore', () => ({
  useExecutionStoreActions: () => ({
    setActivityExecutions: mockSetActivityExecutions,
  }),
}))

vi.mock('./BuilderFlow', () => ({
  BuilderFlow: () => <div data-testid="builder-flow" />,
}))

const mockLoadWorkflow = vi.fn(() => ({ activities: [], edges: [] }))

vi.mock('./utils/loadWorkflow', () => ({
  loadWorkflow: () => mockLoadWorkflow(),
}))

describe('ExecutionViewContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders builder flow and loads workflow into store', async () => {
    const workflow = {
      id: 'workflow-1',
      triggers: [],
      workflow: { activities: [] },
    } as never

    render(<ExecutionViewContent workflow={workflow} executionId="exec-1" executionStatus={null} />)

    expect(screen.getByTestId('builder-flow')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockLoadWorkflowWithEdges).toHaveBeenCalled()
    })
  })

  it('logs a warning for invalid workflow structure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const workflow = {
      id: 'workflow-invalid',
      triggers: [],
      workflow: {},
    } as never

    render(<ExecutionViewContent workflow={workflow} executionId="exec-1" executionStatus={null} />)

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled()
      expect(mockLoadWorkflowWithEdges).not.toHaveBeenCalled()
    })

    warnSpy.mockRestore()
  })

  it('adds trigger edges for parallel workflows', async () => {
    const workflow = {
      id: 'workflow-parallel',
      triggers: [{ type: 'manual' }],
      workflow: {
        activities: [
          {
            id: 'parallel-1',
            type: 'parallel',
            branches: [
              {
                id: 'task-1',
                type: 'task',
                name: 'Task',
                task: { executor: 'script', config: { language: 'bash', code: 'echo' } },
              },
            ],
          },
        ],
      },
    } as never

    render(<ExecutionViewContent workflow={workflow} executionId="exec-1" executionStatus={null} />)

    await waitFor(() => {
      expect(mockLoadWorkflowWithEdges).toHaveBeenCalled()
    })

    const edges = mockLoadWorkflowWithEdges.mock.calls[0][1] as Array<{ id: string }>
    expect(edges.some((edge) => edge.id === `${buildTriggerNodeId(0)}-task-1`)).toBe(true)
  })
})
