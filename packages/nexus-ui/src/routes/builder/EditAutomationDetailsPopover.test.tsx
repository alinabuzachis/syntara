import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EditAutomationDetailsPopover } from './EditAutomationDetailsPopover'

describe('EditAutomationDetailsPopover', () => {
  it('renders edit button with accessible label', () => {
    const onApply = vi.fn()
    render(
      <EditAutomationDetailsPopover name="My Workflow" description="A test workflow" tags={[]} onApply={onApply} />
    )
    expect(screen.getByRole('button', { name: 'Edit automation details' })).toBeInTheDocument()
  })

  it('opens popover when edit button is clicked', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(
      <EditAutomationDetailsPopover name="My Workflow" description="A test workflow" tags={[]} onApply={onApply} />
    )
    await user.click(screen.getByRole('button', { name: 'Edit automation details' }))
    await waitFor(() => {
      expect(screen.getByText('Edit automation details')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Name')).toHaveValue('My Workflow')
    expect(screen.getByLabelText('Description')).toHaveValue('A test workflow')
  })

  it('calls onApply with updated values when Close is clicked', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(
      <EditAutomationDetailsPopover name="My Workflow" description="A test workflow" tags={[]} onApply={onApply} />
    )
    await user.click(screen.getByRole('button', { name: 'Edit automation details' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Updated Name')
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    await user.click(closeButtons[closeButtons.length - 1])
    expect(onApply).toHaveBeenCalledWith('Updated Name', 'A test workflow', [])
  })

  it('adds tag on Enter key', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<EditAutomationDetailsPopover name="Workflow" description="" tags={[]} onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Edit automation details' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Add tag')).toBeInTheDocument()
    })
    const tagInput = screen.getByLabelText('Add tag')
    await user.type(tagInput, 'deploy{Enter}')
    expect(screen.getByText('deploy')).toBeInTheDocument()
  })

  it('adds tag on comma', async () => {
    const user = userEvent.setup()
    render(<EditAutomationDetailsPopover name="Workflow" description="" tags={[]} onApply={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Edit automation details' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Add tag')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText('Add tag'), 'prod,')
    expect(screen.getByText('prod')).toBeInTheDocument()
  })

  it('removes tag when close button is clicked', async () => {
    const user = userEvent.setup()
    render(<EditAutomationDetailsPopover name="Workflow" description="" tags={['deploy']} onApply={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Edit automation details' }))
    await waitFor(() => {
      expect(screen.getByText('deploy')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Remove deploy'))
    expect(screen.queryByText('deploy')).not.toBeInTheDocument()
  })

  it('does not call onApply when Name is cleared and Close is clicked', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<EditAutomationDetailsPopover name="My Workflow" description="Desc" tags={[]} onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Edit automation details' }))
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
