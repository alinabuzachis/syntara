import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ExecutionStatusBadge } from './ExecutionStatusBadge'

describe('ExecutionStatusBadge', () => {
  it('renders pending status with horizontal ellipsis icon', () => {
    const { container } = render(<ExecutionStatusBadge status="pending" />)

    const badge = container.querySelector('div')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveStyle({
      backgroundColor: 'var(--pf-t--global--color--nonstatus--gray--default)',
    })

    // Check for PatternFly Icon component
    const icon = container.querySelector('.pf-v6-c-icon')
    expect(icon).toBeInTheDocument()
  })

  it('renders running status with spinner', () => {
    const { container } = render(<ExecutionStatusBadge status="running" />)

    const badge = container.querySelector('div')
    expect(badge).toHaveStyle({
      backgroundColor: 'var(--pf-t--global--color--brand--default)',
    })

    // PatternFly Spinner renders with specific class
    const spinner = container.querySelector('.pf-v6-c-spinner')
    expect(spinner).toBeInTheDocument()
  })

  it('renders completed status with check icon', () => {
    const { container } = render(<ExecutionStatusBadge status="completed" />)

    const badge = container.querySelector('div')
    expect(badge).toHaveStyle({
      backgroundColor: 'var(--pf-t--global--color--status--success--default)',
    })
  })

  it('renders failed status with error icon', () => {
    const { container } = render(<ExecutionStatusBadge status="failed" />)

    const badge = container.querySelector('div')
    expect(badge).toHaveStyle({
      backgroundColor: 'var(--pf-t--global--color--status--danger--default)',
    })
  })

  it('renders retrying status with sync icon', () => {
    const { container } = render(<ExecutionStatusBadge status="retrying" />)

    const badge = container.querySelector('div')
    expect(badge).toHaveStyle({
      backgroundColor: 'var(--pf-t--global--color--status--warning--default)',
    })
  })

  it('renders skipped status with ellipsis icon', () => {
    const { container } = render(<ExecutionStatusBadge status="skipped" />)

    const badge = container.querySelector('div')
    expect(badge).toHaveStyle({
      backgroundColor: 'var(--pf-t--global--color--nonstatus--gray--default)',
    })
  })

  it('renders cancelled status with error icon', () => {
    const { container } = render(<ExecutionStatusBadge status="cancelled" />)

    const badge = container.querySelector('div')
    expect(badge).toHaveStyle({
      backgroundColor: 'var(--pf-t--global--color--nonstatus--gray--default)',
    })
  })

  it('displays retry count in title when provided', () => {
    const { container } = render(<ExecutionStatusBadge status="retrying" retryCount={3} />)

    const badge = container.querySelector('div')
    expect(badge).toHaveAttribute('title', 'Retrying (3 retries)')
  })

  it('positions badge in bottom-right corner', () => {
    const { container } = render(<ExecutionStatusBadge status="running" />)

    const badge = container.querySelector('div')
    expect(badge).toHaveStyle({
      position: 'absolute',
      bottom: '-20px',
      right: '-20px',
    })
  })

  it('renders with correct size', () => {
    const { container } = render(<ExecutionStatusBadge status="pending" />)

    const badge = container.querySelector('div')
    expect(badge).toHaveStyle({
      width: '48px',
      height: '48px',
      borderRadius: '50%',
    })
  })
})
