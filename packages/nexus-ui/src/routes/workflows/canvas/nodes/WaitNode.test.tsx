import type { WaitActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { useNodeMenuActions } from './hooks/useNodeMenuActions'
import { WaitNodeComponent } from './WaitNode'

vi.mock('./hooks/useNodeMenuActions', () => ({
  useNodeMenuActions: vi.fn(),
  MenuNodeType: {
    ACTIVITY: 'activity',
    TRIGGER: 'trigger',
  },
}))

const mockUseNodeMenuActions = vi.mocked(useNodeMenuActions)

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    deleteElements: vi.fn(),
    updateNode: vi.fn(),
    getNode: vi.fn(),
  }),
  useStore: (selector: (s: { transform: [number, number, number] }) => unknown) => selector({ transform: [0, 0, 1] }),
  useUpdateNodeInternals: () => vi.fn(),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  Handle: () => null,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

const baseWaitNode: WaitActivity = {
  type: 'wait',
  id: 'wait-1',
  name: 'Wait 5 minutes',
  config: {
    duration: 300,
  },
}

const createNodeProps = (data: WaitActivity) => ({
  id: data.id,
  data,
  type: 'wait' as const,
  position: { x: 0, y: 0 },
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  selected: false,
  dragging: false,
  isConnectable: true,
  zIndex: 0,
  selectable: true,
  deletable: true,
  draggable: true,
})

describe('WaitNodeComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseNodeMenuActions.mockReturnValue([])
  })

  describe('Rendering', () => {
    it('renders wait node with name', () => {
      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(baseWaitNode)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('Wait 5 minutes')).toBeInTheDocument()
    })

    it('renders Wait label', () => {
      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(baseWaitNode)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('Wait')).toBeInTheDocument()
    })

    it('renders "Untitled Wait" when name is undefined', () => {
      const unnamed = {
        type: 'wait',
        id: 'wait-unnamed',
        config: { duration: 60 },
      } as WaitActivity

      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(unnamed)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('Untitled Wait')).toBeInTheDocument()
    })
  })

  describe('Duration Display', () => {
    it('renders non-zero duration parts only', () => {
      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(baseWaitNode)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('5m')).toBeInTheDocument()
    })

    it('renders multiple duration parts', () => {
      const multiDuration: WaitActivity = {
        ...baseWaitNode,
        config: { duration: 95400 },
      }

      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(multiDuration)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('1d 2h 30m')).toBeInTheDocument()
    })

    it('renders "Not configured" when no duration is set', () => {
      const noDuration: WaitActivity = {
        ...baseWaitNode,
        config: { duration: 0 },
      }

      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(noDuration)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('Not configured')).toBeInTheDocument()
    })

    it('handles missing config gracefully', () => {
      const noConfig = {
        type: 'wait',
        id: 'wait-no-config',
        name: 'No Config',
      } as WaitActivity

      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(noConfig)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('Not configured')).toBeInTheDocument()
    })

    it('renders seconds when duration includes seconds', () => {
      const withSeconds: WaitActivity = {
        ...baseWaitNode,
        config: { duration: 65 },
      }

      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(withSeconds)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('1m 5s')).toBeInTheDocument()
    })

    it('renders only seconds for sub-minute duration', () => {
      const secondsOnly: WaitActivity = {
        ...baseWaitNode,
        config: { duration: 30 },
      }

      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(secondsOnly)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('30s')).toBeInTheDocument()
    })

    it('renders all parts when all time units present', () => {
      const allParts: WaitActivity = {
        ...baseWaitNode,
        config: { duration: 90061 },
      }

      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(allParts)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('1d 1h 1m 1s')).toBeInTheDocument()
    })
  })

  describe('Execution State', () => {
    it('handles execution state data', () => {
      const nodeWithExecution = {
        ...baseWaitNode,
        __executionState: {
          status: 'waiting',
          started_at: '2024-01-01T00:00:00Z',
        },
      } as WaitActivity

      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(nodeWithExecution)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('Wait 5 minutes')).toBeInTheDocument()
    })

    it('shows both duration and countdown when waiting', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T00:01:00Z'))

      const nodeWithExecution = {
        ...baseWaitNode,
        __executionState: {
          status: 'waiting',
          started_at: '2024-01-01T00:00:00Z',
        },
      } as WaitActivity

      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(nodeWithExecution)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('5m')).toBeInTheDocument()
      expect(screen.getByText('00:04:00')).toBeInTheDocument()

      vi.useRealTimers()
    })

    it('shows only duration when not executing', () => {
      const nodeWithCompletion = {
        ...baseWaitNode,
        __executionState: {
          status: 'completed',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:05:00Z',
        },
      } as WaitActivity

      render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(nodeWithCompletion)} />
        </ReactFlowProvider>
      )

      expect(screen.getByText('5m')).toBeInTheDocument()
      expect(screen.queryByText(/Countdown/)).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(
        <ReactFlowProvider>
          <WaitNodeComponent {...createNodeProps(baseWaitNode)} />
        </ReactFlowProvider>
      )

      const results = await axe(container)

      expect(results).toHaveNoViolations()
    })
  })
})
