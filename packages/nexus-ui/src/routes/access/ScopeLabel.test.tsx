import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ScopeLabel } from './ScopeLabel'

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

const projectNameMap = new Map([
  ['proj-1', 'Alpha Project'],
  ['proj-2', 'Beta Project'],
])

describe('ScopeLabel', () => {
  it('has no accessibility violations for system scope', async () => {
    const { container } = render(<ScopeLabel projectNameMap={projectNameMap} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations for project scope', async () => {
    const { container } = render(<ScopeLabel projectId="proj-1" projectNameMap={projectNameMap} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders "System" label when no projectId is provided', () => {
    render(<ScopeLabel projectNameMap={projectNameMap} />)
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('renders project name label when projectId is provided', () => {
    render(<ScopeLabel projectId="proj-1" projectNameMap={projectNameMap} />)
    expect(screen.getByText('Alpha Project')).toBeInTheDocument()
  })

  it('falls back to projectId when name is not in the map', () => {
    render(<ScopeLabel projectId="unknown-id" projectNameMap={projectNameMap} />)
    expect(screen.getByText('unknown-id')).toBeInTheDocument()
  })

  it('is keyboard accessible for project-scoped labels', async () => {
    const user = userEvent.setup()
    render(<ScopeLabel projectId="proj-1" projectNameMap={projectNameMap} />)

    const link = screen.getByRole('link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('tabIndex', '0')

    await user.tab()
    expect(link).toHaveFocus()
  })
})
