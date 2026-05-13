import type { ConvergeActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConvergeNodeComponent } from './ConvergeNode'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    deleteElements: vi.fn(),
    updateNode: vi.fn(),
    getNode: vi.fn(),
  }),
  useStore: (selector: (s: { transform: [number, number, number] }) => unknown) => selector({ transform: [0, 0, 1] }),
  useUpdateNodeInternals: () => vi.fn(),
  Handle: () => null,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

describe('ConvergeNodeComponent', () => {
  const baseConvergeNode = {
    type: 'converge',
    id: 'converge-1',
    name: 'Wait for All',
    config: {
      strategy: 'all',
    },
  } as ConvergeActivity

  const createNodeProps = (data: ConvergeActivity) => ({
    id: data.id,
    data,
    type: 'converge' as const,
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

  describe('Rendering', () => {
    it('renders converge node with name', () => {
      render(<ConvergeNodeComponent {...createNodeProps(baseConvergeNode)} />)

      expect(screen.getByText('Wait for All')).toBeInTheDocument()
    })

    it('renders Converge label', () => {
      render(<ConvergeNodeComponent {...createNodeProps(baseConvergeNode)} />)

      expect(screen.getByText('Converge')).toBeInTheDocument()
    })
  })

  describe('Strategy Display', () => {
    it('renders "All" for strategy all', () => {
      render(<ConvergeNodeComponent {...createNodeProps(baseConvergeNode)} />)

      expect(screen.getByText('Type')).toBeInTheDocument()
      expect(screen.getByText('All')).toBeInTheDocument()
    })

    it('defaults to "All" when strategy is missing', () => {
      const noStrategyConverge = {
        type: 'converge',
        id: 'converge-3',
        name: 'Default Strategy',
        config: {},
      } as ConvergeActivity

      render(<ConvergeNodeComponent {...createNodeProps(noStrategyConverge)} />)

      expect(screen.getByText('All')).toBeInTheDocument()
    })

    it('defaults to "All" when config is missing', () => {
      const noConfig = {
        type: 'converge',
        id: 'converge-4',
        name: 'No Config',
      } as ConvergeActivity

      render(<ConvergeNodeComponent {...createNodeProps(noConfig)} />)

      expect(screen.getByText('All')).toBeInTheDocument()
    })

    it('renders "All" for strategy all (explicit)', () => {
      const explicitStrategyConverge = {
        type: 'converge',
        id: 'converge-5',
        name: 'Explicit Strategy',
        config: {
          strategy: 'all',
        },
      } as ConvergeActivity

      render(<ConvergeNodeComponent {...createNodeProps(explicitStrategyConverge)} />)

      expect(screen.getByText('Type')).toBeInTheDocument()
      expect(screen.getByText('All')).toBeInTheDocument()
    })
  })

  describe('Empty name', () => {
    it('renders with undefined name', () => {
      const unnamedConverge = {
        type: 'converge',
        id: 'converge-5',
        config: {
          strategy: 'all',
        },
      } as ConvergeActivity

      render(<ConvergeNodeComponent {...createNodeProps(unnamedConverge)} />)

      // Should render without crashing, label should still be present
      expect(screen.getByText('Converge')).toBeInTheDocument()
    })
  })

  describe('Execution State', () => {
    it('handles execution state data', () => {
      const nodeWithExecution = {
        ...baseConvergeNode,
        __executionState: {
          status: 'waiting',
          started_at: '2024-01-01T00:00:00Z',
        },
      } as ConvergeActivity

      render(<ConvergeNodeComponent {...createNodeProps(nodeWithExecution)} />)

      // Should render without crashing
      expect(screen.getByText('Wait for All')).toBeInTheDocument()
    })

    it('handles completed execution state', () => {
      const nodeWithExecution = {
        ...baseConvergeNode,
        __executionState: {
          status: 'completed',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:02:00Z',
        },
      } as ConvergeActivity

      render(<ConvergeNodeComponent {...createNodeProps(nodeWithExecution)} />)

      expect(screen.getByText('Wait for All')).toBeInTheDocument()
    })
  })

  describe('Node Structure', () => {
    it('renders with correct structure', () => {
      render(<ConvergeNodeComponent {...createNodeProps(baseConvergeNode)} />)

      expect(screen.getByTestId('converge-node')).toBeInTheDocument()
    })

    it('renders details section', () => {
      render(<ConvergeNodeComponent {...createNodeProps(baseConvergeNode)} />)

      expect(screen.getByTestId('converge-node-details')).toBeInTheDocument()
    })
  })
})
