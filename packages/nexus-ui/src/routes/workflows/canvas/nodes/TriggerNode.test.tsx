import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ExecutionViewContext } from '../../../builder/ExecutionViewContext'

import { TriggerNodeComponent } from './TriggerNode'

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

vi.mock('./hooks/useNodeMenuActions', () => ({
  MenuNodeType: { TRIGGER: 'trigger' },
  useNodeMenuActions: () => [
    {
      id: 'edit',
      label: 'Edit',
      onClick: vi.fn(),
    },
  ],
}))

describe('TriggerNodeComponent', () => {
  const createNodeProps = (
    dataOverrides?: Partial<{ name: string; details: string | null; triggerType?: string }>
  ) => ({
    id: 'trigger-0',
    data: {
      name: 'Trigger',
      details: 'Manual',
      triggerType: 'manual_trigger',
      ...dataOverrides,
    },
    type: 'trigger' as const,
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

  it('shows the step actions menu outside execution view', () => {
    render(<TriggerNodeComponent {...createNodeProps()} />)

    expect(screen.getByLabelText('Step actions menu')).toBeInTheDocument()
  })

  it('hides the step actions menu in execution view', () => {
    render(
      <ExecutionViewContext.Provider value={true}>
        <TriggerNodeComponent {...createNodeProps()} />
      </ExecutionViewContext.Provider>
    )

    expect(screen.queryByLabelText('Step actions menu')).not.toBeInTheDocument()
  })

  it('renders "Manual trigger" when the manual trigger details are shown', () => {
    render(
      <TriggerNodeComponent
        {...createNodeProps({
          name: 'Trigger',
          details: null,
          triggerType: 'manual_trigger',
        })}
      />
    )

    expect(screen.getByText('Manual trigger')).toBeInTheDocument()
  })

  it('renders "Schedule trigger" for scheduled triggers with cadence details', () => {
    render(
      <TriggerNodeComponent
        {...createNodeProps({
          name: 'MyTrigger',
          details: 'Continuous',
          triggerType: 'scheduled',
        })}
      />
    )

    expect(screen.getByText('Schedule trigger')).toBeInTheDocument()
    expect(screen.getByText('Continuous')).toBeInTheDocument()
  })

  it('renders names containing parentheses correctly', () => {
    render(
      <TriggerNodeComponent
        {...createNodeProps({
          name: 'Hello(World)',
          details: 'Manual',
          triggerType: 'manual_trigger',
        })}
      />
    )

    expect(screen.getByText('Hello(World)')).toBeInTheDocument()
  })

  it('renders long trigger name without overflow', () => {
    render(
      <TriggerNodeComponent
        {...createNodeProps({
          name: '${name_via_ai.analysis.default_trigger_configuration}',
          details: 'Every 5 minutes on weekdays',
          triggerType: 'scheduled',
        })}
      />
    )

    expect(screen.getByText('${name_via_ai.analysis.default_trigger_configuration}')).toBeInTheDocument()
    expect(screen.getByText('Every 5 minutes on weekdays')).toBeInTheDocument()
  })
})
