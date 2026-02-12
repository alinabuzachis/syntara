import type { ConditionActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConditionNodeComponent, ConditionNodeDetails } from './ConditionNode'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    deleteElements: vi.fn(),
    updateNode: vi.fn(),
    getNode: vi.fn(),
  }),
  Handle: () => null,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

describe('ConditionNodeComponent', () => {
  const baseConditionNode = {
    type: 'condition',
    id: 'condition-1',
    name: 'Check Status',
    condition: 'status === "active"',
  } as ConditionActivity

  const createNodeProps = (data: ConditionActivity) => ({
    id: data.id,
    data,
    type: 'condition' as const,
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
    it('renders condition node with name', () => {
      render(<ConditionNodeComponent {...createNodeProps(baseConditionNode)} />)

      expect(screen.getByText('Check Status')).toBeInTheDocument()
    })

    it('renders condition label', () => {
      render(<ConditionNodeComponent {...createNodeProps(baseConditionNode)} />)

      expect(screen.getByText('Condition')).toBeInTheDocument()
    })

    it('renders True and False branch handles', () => {
      render(<ConditionNodeComponent {...createNodeProps(baseConditionNode)} />)

      expect(screen.getByText('True')).toBeInTheDocument()
      expect(screen.getByText('False')).toBeInTheDocument()
    })
  })

  describe('Untitled condition', () => {
    it('shows "Untitled Condition" when name is missing', () => {
      const unnamedCondition = {
        type: 'condition',
        id: 'condition-2',
        condition: 'x > 0',
      } as ConditionActivity

      render(<ConditionNodeComponent {...createNodeProps(unnamedCondition)} />)

      expect(screen.getByText('Untitled Condition')).toBeInTheDocument()
    })
  })

  describe('Branch Handles', () => {
    it('renders handles in correct order (true first, then false)', () => {
      render(<ConditionNodeComponent {...createNodeProps(baseConditionNode)} />)

      const handles = screen.getAllByText(/True|False/)
      expect(handles[0]).toHaveTextContent('True')
      expect(handles[1]).toHaveTextContent('False')
    })
  })

  describe('Execution State', () => {
    it('handles execution state data', () => {
      const nodeWithExecution = {
        ...baseConditionNode,
        __executionState: {
          status: 'running',
          started_at: '2024-01-01T00:00:00Z',
        },
      } as ConditionActivity

      render(<ConditionNodeComponent {...createNodeProps(nodeWithExecution)} />)

      // Should render without crashing
      expect(screen.getByText('Check Status')).toBeInTheDocument()
    })
  })
})

describe('ConditionNodeDetails', () => {
  const baseConditionActivity = {
    type: 'condition',
    id: 'condition-1',
    name: 'Test Condition',
    condition: 'x > 5',
  } as ConditionActivity

  it('renders condition name as title', () => {
    render(<ConditionNodeDetails conditionActivity={baseConditionActivity} />)

    expect(screen.getByText('Test Condition')).toBeInTheDocument()
  })

  it('renders "Untitled Condition" when name is null', () => {
    const unnamed = {
      type: 'condition',
      id: 'condition-2',
      condition: 'y < 10',
    } as ConditionActivity

    render(<ConditionNodeDetails conditionActivity={unnamed} />)

    expect(screen.getByText('Untitled Condition')).toBeInTheDocument()
  })

  it('renders custom icon when provided', () => {
    const icon = <svg data-testid="custom-icon" />
    render(<ConditionNodeDetails conditionActivity={baseConditionActivity} icon={icon} />)

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })

  it('renders children (branch handles)', () => {
    render(
      <ConditionNodeDetails conditionActivity={baseConditionActivity}>
        <div data-testid="branch-handles">Branch Handles</div>
      </ConditionNodeDetails>
    )

    expect(screen.getByTestId('branch-handles')).toBeInTheDocument()
  })

  it('renders outputs when present', () => {
    const conditionWithOutputs = {
      ...baseConditionActivity,
      outputs: { result: { type: 'string' }, evaluated: { type: 'string' } },
    } as ConditionActivity

    render(<ConditionNodeDetails conditionActivity={conditionWithOutputs} />)

    expect(screen.getByText('Outputs')).toBeInTheDocument()
  })

  it('renders JSON when showJson is true', () => {
    render(<ConditionNodeDetails conditionActivity={baseConditionActivity} showJson />)

    expect(screen.getByText('Full Definition')).toBeInTheDocument()
  })

  it('does not render JSON when showJson is false', () => {
    render(<ConditionNodeDetails conditionActivity={baseConditionActivity} showJson={false} />)

    expect(screen.queryByText('Full Definition')).not.toBeInTheDocument()
  })
})
