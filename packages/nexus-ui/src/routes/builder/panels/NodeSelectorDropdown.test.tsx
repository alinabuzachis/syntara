import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { UpstreamNodeInfo } from './hooks/useUpstreamNodes'
import { NodeSelectorDropdown } from './NodeSelectorDropdown'

const mockNodes: UpstreamNodeInfo[] = [
  { id: 'node-1', name: 'Fetch Data', type: 'script' },
  { id: 'node-2', name: 'Transform', type: 'script' },
  { id: 'node-3', name: 'Validate', type: 'http_request' },
]

describe('NodeSelectorDropdown', () => {
  it('renders dropdown with the selected node name as toggle text', () => {
    render(<NodeSelectorDropdown nodes={mockNodes} selectedNodeId="node-1" onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Fetch Data/i })).toBeInTheDocument()
  })

  it('shows first node name as default toggle text when selected', () => {
    render(<NodeSelectorDropdown nodes={mockNodes} selectedNodeId="node-1" onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Fetch Data/i })).toBeInTheDocument()
  })

  it('shows all node options when opened', async () => {
    const user = userEvent.setup()
    render(<NodeSelectorDropdown nodes={mockNodes} selectedNodeId="node-1" onSelect={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Fetch Data/i }))

    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByText('Fetch Data')).toBeInTheDocument()
    expect(within(listbox).getByText('Transform')).toBeInTheDocument()
    expect(within(listbox).getByText('Validate')).toBeInTheDocument()
  })

  it('calls onSelect with node id when an option is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<NodeSelectorDropdown nodes={mockNodes} selectedNodeId="node-1" onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /Fetch Data/i }))
    await user.click(screen.getByRole('option', { name: 'Transform' }))

    expect(onSelect).toHaveBeenCalledWith('node-2')
  })

  it('shows selected option with a checkmark', async () => {
    const user = userEvent.setup()
    render(<NodeSelectorDropdown nodes={mockNodes} selectedNodeId="node-2" onSelect={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Transform/i }))

    const selectedOption = screen.getByRole('option', { name: 'Transform', selected: true })
    expect(selectedOption).toBeInTheDocument()
  })

  it('displays node id when a node has no name', () => {
    const nodesWithMissingName: UpstreamNodeInfo[] = [{ id: 'node-anon', type: 'script' }]
    render(<NodeSelectorDropdown nodes={nodesWithMissingName} selectedNodeId="node-anon" onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: /node-anon/i })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<NodeSelectorDropdown nodes={mockNodes} selectedNodeId="node-1" onSelect={vi.fn()} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
