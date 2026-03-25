import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { NodeTypeOption } from './NodeTypeOptionsList'
import { NodeTypeOptionsList } from './NodeTypeOptionsList'

vi.mock('../automations/canvas/nodes/renderNodeIcon', () => ({
  renderNodeIcon: vi.fn((_icon, id) => <span data-testid={`icon-${id}`}>Icon</span>),
}))

vi.mock('./utils/nodeIcons', () => ({
  resolveIconForType: vi.fn(({ nodeTypeId }: { nodeTypeId: string }) => ({
    icon: vi.fn(),
    id: nodeTypeId,
  })),
}))

const mockNodeTypes: NodeTypeOption[] = [
  { id: 'action', label: 'Action Node', icon: vi.fn(), description: 'Perform an action' },
  { id: 'condition', label: 'Condition Node', icon: vi.fn(), description: 'Add conditional logic' },
  { id: 'loop', label: 'Loop Node', icon: vi.fn() },
]

describe('NodeTypeOptionsList', () => {
  it('renders all node types with labels and icons', () => {
    const onSelect = vi.fn()
    render(<NodeTypeOptionsList nodeTypes={mockNodeTypes} onSelect={onSelect} />)

    expect(screen.getByText('Action Node')).toBeInTheDocument()
    expect(screen.getByText('Condition Node')).toBeInTheDocument()
    expect(screen.getByText('Loop Node')).toBeInTheDocument()

    expect(screen.getByTestId('icon-action')).toBeInTheDocument()
    expect(screen.getByTestId('icon-condition')).toBeInTheDocument()
    expect(screen.getByTestId('icon-loop')).toBeInTheDocument()
  })

  it('renders descriptions when provided', () => {
    const onSelect = vi.fn()
    render(<NodeTypeOptionsList nodeTypes={mockNodeTypes} onSelect={onSelect} />)

    expect(screen.getByText('Perform an action')).toBeInTheDocument()
    expect(screen.getByText('Add conditional logic')).toBeInTheDocument()
  })

  it('does not render description element when description is not provided', () => {
    const onSelect = vi.fn()
    const nodeTypesWithoutDesc: NodeTypeOption[] = [{ id: 'test', label: 'Test Node', icon: vi.fn() }]
    const { container } = render(<NodeTypeOptionsList nodeTypes={nodeTypesWithoutDesc} onSelect={onSelect} />)

    expect(screen.getByText('Test Node')).toBeInTheDocument()

    expect(container.querySelector('small')).not.toBeInTheDocument()
  })

  it('calls onSelect with correct nodeId when clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<NodeTypeOptionsList nodeTypes={mockNodeTypes} onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: 'Action Node' }))
    expect(onSelect).toHaveBeenCalledWith('action')

    await user.click(screen.getByRole('button', { name: 'Condition Node' }))
    expect(onSelect).toHaveBeenCalledWith('condition')
  })

  it('calls onSelect when Enter key is pressed', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<NodeTypeOptionsList nodeTypes={mockNodeTypes} onSelect={onSelect} />)

    const actionButton = screen.getByRole('button', { name: 'Action Node' })
    actionButton.focus()
    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledWith('action')
  })

  it('calls onSelect when Space key is pressed', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<NodeTypeOptionsList nodeTypes={mockNodeTypes} onSelect={onSelect} />)

    const conditionButton = screen.getByRole('button', { name: 'Condition Node' })
    conditionButton.focus()
    await user.keyboard(' ')

    expect(onSelect).toHaveBeenCalledWith('condition')
  })

  it('renders with correct accessibility attributes', () => {
    const onSelect = vi.fn()
    render(<NodeTypeOptionsList nodeTypes={mockNodeTypes} onSelect={onSelect} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)

    buttons.forEach((button) => {
      expect(button).toHaveAttribute('tabIndex', '0')
    })
  })

  it('renders empty when nodeTypes array is empty', () => {
    const onSelect = vi.fn()
    const { container } = render(<NodeTypeOptionsList nodeTypes={[]} onSelect={onSelect} />)

    expect(container).toBeEmptyDOMElement()
  })
})
