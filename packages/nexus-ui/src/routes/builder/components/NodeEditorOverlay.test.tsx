import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NodeEditorOverlay } from './NodeEditorOverlay'

vi.mock('../NodeDetailsPanel', () => ({
  NodeDetailsPanel: ({ mode }: { mode: string }) => <div data-testid="node-details-panel">{mode}</div>,
}))

describe('NodeEditorOverlay', () => {
  const baseProps = {
    isOpen: true,
    mode: 'edit' as const,
    selectedNode: {
      id: 'task-1',
      type: 'task',
      position: { x: 0, y: 0 },
      data: { id: 'task-1', type: 'task', name: 'Task' },
    } as never,
    nodeTypeId: null,
    nodeSubtypeId: null,
    sourceNodeId: null,
    replacementNodeId: null,
    onConnect: vi.fn(),
    onClose: vi.fn(),
  }

  it('renders nothing when closed', () => {
    const { container } = render(<NodeEditorOverlay {...baseProps} isOpen={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders NodeDetailsPanel when open', () => {
    render(<NodeEditorOverlay {...baseProps} />)
    expect(screen.getByTestId('node-details-panel')).toHaveTextContent('edit')
  })
})
