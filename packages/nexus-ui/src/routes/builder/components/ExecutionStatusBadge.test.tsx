import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ExecutionStatusBadge } from './ExecutionStatusBadge'

describe('ExecutionStatusBadge', () => {
  it('renders pending status with neutral border', () => {
    render(<ExecutionStatusBadge status="pending" />)

    const badge = screen.getByLabelText('Pending')
    const style = badge.getAttribute('style') ?? ''
    expect(style).toContain('border-color: var(--pf-t--global--color--nonstatus--gray--300)')
    expect(style).toContain('border-style: solid')
  })

  it('renders running status with spinner', () => {
    const { container } = render(<ExecutionStatusBadge status="running" />)

    const badge = screen.getByLabelText('Running')
    const style = badge.getAttribute('style') ?? ''
    expect(style).toContain('border-color: var(--pf-t--global--color--brand--default)')
    expect(style).toContain('border-style: solid')

    expect(container.querySelector('.pf-v6-c-spinner')).toBeInTheDocument()
  })

  it('maps completed status to success styling', () => {
    render(<ExecutionStatusBadge status="completed" />)

    const badge = screen.getByLabelText('Success')
    const style = badge.getAttribute('style') ?? ''
    expect(style).toContain('border-color: var(--pf-t--global--color--status--success--default)')
  })

  it('maps failed status to error styling', () => {
    render(<ExecutionStatusBadge status="failed" />)

    const badge = screen.getByLabelText('Error')
    const style = badge.getAttribute('style') ?? ''
    expect(style).toContain('border-color: var(--pf-t--global--color--status--danger--default)')
  })

  it('maps retrying status to running styling with retry label', () => {
    render(<ExecutionStatusBadge status="retrying" retryCount={3} />)

    const badge = screen.getByLabelText('Retrying (3 retries)')
    const style = badge.getAttribute('style') ?? ''
    expect(style).toContain('border-color: var(--pf-t--global--color--brand--default)')
  })

  it('displays retry count in title when provided', () => {
    render(<ExecutionStatusBadge status="retrying" retryCount={3} />)

    const badge = screen.getByLabelText('Retrying (3 retries)')
    expect(badge).toHaveAttribute('title', 'Retrying (3 retries)')
  })

  it('renders skipped status with dashed border', () => {
    render(<ExecutionStatusBadge status="skipped" />)

    const badge = screen.getByLabelText('Skipped')
    const style = badge.getAttribute('style') ?? ''
    expect(style).toContain('border-color: var(--pf-t--global--color--nonstatus--gray--default)')
    expect(style).toContain('border-style: dashed')
  })

  it('renders cancelled status with muted border', () => {
    render(<ExecutionStatusBadge status="cancelled" />)

    const badge = screen.getByLabelText('Cancelled')
    const style = badge.getAttribute('style') ?? ''
    expect(style).toContain('border-color: var(--pf-t--global--color--nonstatus--gray--300)')
  })

  it('positions badge in bottom-right corner', () => {
    render(<ExecutionStatusBadge status="running" />)

    const badge = screen.getByLabelText('Running')
    expect(badge).toHaveStyle({
      position: 'absolute',
      bottom: '-20px',
      right: '-20px',
    })
  })

  it('renders with correct size', () => {
    render(<ExecutionStatusBadge status="pending" />)

    const badge = screen.getByLabelText('Pending')
    expect(badge).toHaveStyle({
      width: '48px',
      height: '48px',
      borderRadius: '50%',
    })
  })
})
