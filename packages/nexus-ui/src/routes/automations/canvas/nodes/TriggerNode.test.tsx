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
  const createNodeProps = (dataOverrides?: Partial<{ label: string; triggerType?: string }>) => ({
    id: 'trigger-0',
    data: {
      label: 'Manual',
      triggerType: 'manual',
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

  it('shows the node menu outside execution view', () => {
    render(<TriggerNodeComponent {...createNodeProps()} />)

    expect(screen.getByLabelText('Node actions menu')).toBeInTheDocument()
  })

  it('hides the node menu in execution view', () => {
    render(
      <ExecutionViewContext.Provider value={true}>
        <TriggerNodeComponent {...createNodeProps()} />
      </ExecutionViewContext.Provider>
    )

    expect(screen.queryByLabelText('Node actions menu')).not.toBeInTheDocument()
  })

  it('renders "Manual trigger" when the manual trigger details are shown', () => {
    render(
      <TriggerNodeComponent
        {...createNodeProps({
          label: 'Trigger (Manual)',
          triggerType: 'manual',
        })}
      />
    )

    expect(screen.getByText('Manual trigger')).toBeInTheDocument()
  })

  it('renders "Schedule trigger" for scheduled triggers with cadence details', () => {
    render(
      <TriggerNodeComponent
        {...createNodeProps({
          label: 'MyTrigger (Continuous)',
          triggerType: 'scheduled',
        })}
      />
    )

    expect(screen.getByText('Schedule trigger')).toBeInTheDocument()
    expect(screen.getByText('Continuous')).toBeInTheDocument()
  })
})
