import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EditWorkflowDetailsPopover } from './EditWorkflowDetailsPopover'

describe('EditWorkflowDetailsPopover', () => {
  it('renders edit button with accessible label', () => {
    const onApply = vi.fn()
    render(<EditWorkflowDetailsPopover name="My Workflow" description="A test workflow" onApply={onApply} />)
    expect(screen.getByRole('button', { name: 'Edit workflow details' })).toBeInTheDocument()
  })

  it('opens popover when edit button is clicked', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<EditWorkflowDetailsPopover name="My Workflow" description="A test workflow" onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Edit workflow details' }))
    await waitFor(() => {
      expect(screen.getByText('Edit workflow details')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Name')).toHaveValue('My Workflow')
    expect(screen.getByLabelText('Description')).toHaveValue('A test workflow')
  })

  it('calls onApply with updated values when Close is clicked', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<EditWorkflowDetailsPopover name="My Workflow" description="A test workflow" onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Edit workflow details' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Updated Name')
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    await user.click(closeButtons[closeButtons.length - 1])
    expect(onApply).toHaveBeenCalledWith('Updated Name', 'A test workflow')
  })

  it('does not call onApply when Name is cleared and Close is clicked', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<EditWorkflowDetailsPopover name="My Workflow" description="Desc" onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Edit workflow details' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    await user.clear(screen.getByLabelText('Name'))
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    await user.click(closeButtons[closeButtons.length - 1])
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByText('Name is required')).toBeInTheDocument()
  })
})
