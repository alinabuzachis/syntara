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
  const createNodeProps = () => ({
    id: 'trigger-0',
    data: {
      label: 'Manual',
      triggerType: 'manual',
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
})
