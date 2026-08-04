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
          currentVersionName: 'My Release v2',
          expectedVersion: 3,
          expectedVersionName: 'Initial Draft',
          expectedVersionCreatedAt: '2026-05-15T10:00:00Z',
          createdByUsername: 'alice',
          createdAt: '2026-06-01T00:00:00Z',
        }}
      />
    )

    expect(screen.getByText(/My Release v2/)).toBeInTheDocument()
    expect(screen.getByText(/was saved by/)).toBeInTheDocument()
    expect(screen.getByText(/alice/)).toBeInTheDocument()
    expect(screen.getByText(/Initial Draft/)).toBeInTheDocument()
  })

  it('falls back to formatted dates when version names are null', () => {
    render(
      <VersionConflictDialog
        {...defaultProps}
        conflictInfo={{
          currentVersion: 5,
          currentVersionName: null,
          expectedVersion: 3,
          expectedVersionName: null,
          expectedVersionCreatedAt: '2026-05-15T10:00:00Z',
          createdByUsername: 'alice',
          createdAt: '2026-06-01T00:00:00Z',
        }}
      />
    )

    expect(screen.getByText(/was saved by/)).toBeInTheDocument()
    expect(screen.getByText(/alice/)).toBeInTheDocument()
  })

  it('falls back to version number when no name or date available', () => {
    render(
      <VersionConflictDialog
        {...defaultProps}
        conflictInfo={{
          currentVersion: 5,
          currentVersionName: null,
          expectedVersion: 3,
          expectedVersionName: null,
          expectedVersionCreatedAt: null,
          createdByUsername: 'alice',
          createdAt: '',
        }}
      />
    )

    const paragraph = screen.getByText(/was saved by alice/)
    expect(paragraph).toHaveTextContent('Version 5 was saved by alice')
    expect(paragraph).toHaveTextContent('based on version 3')
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
