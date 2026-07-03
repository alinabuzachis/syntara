import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { VersionConflictDialog } from './VersionConflictDialog'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  conflictAction: 'save' as const,
  onSaveAsNewest: vi.fn(),
  onDuplicate: vi.fn(),
  onRefreshToLatest: vi.fn(),
}

describe('VersionConflictDialog', () => {
  it('renders save conflict variant with correct title and buttons', () => {
    render(<VersionConflictDialog {...defaultProps} conflictAction="save" />)

    expect(screen.getByText('Save conflict: newer version available')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save as newest version' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create duplicate workflow with this version' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh to latest' })).toBeInTheDocument()
  })

  it('renders publish conflict variant with correct title and buttons', () => {
    render(<VersionConflictDialog {...defaultProps} conflictAction="publish" />)

    expect(screen.getByText('Publish conflict: newer version available')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish as newest version' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create duplicate workflow with this version and publish' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh to latest' })).toBeInTheDocument()
  })

  it('calls onSaveAsNewest when primary button is clicked', async () => {
    const user = userEvent.setup()
    const onSaveAsNewest = vi.fn()
    render(<VersionConflictDialog {...defaultProps} onSaveAsNewest={onSaveAsNewest} />)

    await user.click(screen.getByRole('button', { name: 'Save as newest version' }))
    expect(onSaveAsNewest).toHaveBeenCalledOnce()
  })

  it('calls onDuplicate when duplicate button is clicked', async () => {
    const user = userEvent.setup()
    const onDuplicate = vi.fn()
    render(<VersionConflictDialog {...defaultProps} onDuplicate={onDuplicate} />)

    await user.click(screen.getByRole('button', { name: 'Create duplicate workflow with this version' }))
    expect(onDuplicate).toHaveBeenCalledOnce()
  })

  it('calls onRefreshToLatest when refresh button is clicked', async () => {
    const user = userEvent.setup()
    const onRefreshToLatest = vi.fn()
    render(<VersionConflictDialog {...defaultProps} onRefreshToLatest={onRefreshToLatest} />)

    await user.click(screen.getByRole('button', { name: 'Refresh to latest' }))
    expect(onRefreshToLatest).toHaveBeenCalledOnce()
  })

  it('disables action buttons when loading', () => {
    const onSaveAsNewest = vi.fn()
    const onDuplicate = vi.fn()
    const onRefreshToLatest = vi.fn()
    render(
      <VersionConflictDialog
        {...defaultProps}
        isLoading
        onSaveAsNewest={onSaveAsNewest}
        onDuplicate={onDuplicate}
        onRefreshToLatest={onRefreshToLatest}
      />
    )

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /Save as newest version/ })).toHaveAttribute('disabled')
    expect(within(dialog).getByRole('button', { name: /Create duplicate workflow with this version/ })).toHaveAttribute(
      'disabled'
    )
    expect(within(dialog).getByRole('button', { name: /Refresh to latest/ })).toHaveAttribute('disabled')
  })

  it('displays conflict info when provided', () => {
    render(
      <VersionConflictDialog
        {...defaultProps}
        conflictInfo={{
          currentVersion: 5,
          expectedVersion: 3,
          createdByUsername: 'alice',
          createdAt: '2026-06-01T00:00:00Z',
        }}
      />
    )

    expect(screen.getByText(/Version 5 was saved by alice/)).toBeInTheDocument()
    expect(screen.getByText(/Your changes are based on version 3/)).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(<VersionConflictDialog {...defaultProps} isOpen={false} />)

    expect(screen.queryByText('Save conflict: newer version available')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<VersionConflictDialog {...defaultProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
