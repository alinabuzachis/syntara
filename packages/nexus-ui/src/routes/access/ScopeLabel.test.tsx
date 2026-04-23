import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { navigate } from 'wouter/use-browser-location'

import { ProjectLabel, ScopeLabel } from './ScopeLabel'

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

const projectNameMap = new Map([
  ['proj-1', 'Alpha Project'],
  ['proj-2', 'Beta Project'],
])

describe('ScopeLabel', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<ScopeLabel scope="system" />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders "System" for system scope', () => {
    render(<ScopeLabel scope="system" />)
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('renders "Any" for any scope', () => {
    render(<ScopeLabel scope="any" />)
    expect(screen.getByText('Any')).toBeInTheDocument()
  })

  it('renders "Self" for self scope', () => {
    render(<ScopeLabel scope="self" />)
    expect(screen.getByText('Self')).toBeInTheDocument()
  })

  it('renders "Project" for project scope', () => {
    render(<ScopeLabel scope="project" />)
    expect(screen.getByText('Project')).toBeInTheDocument()
  })

  it('defaults to "System" when scope is null', () => {
    render(<ScopeLabel />)
    expect(screen.getByText('System')).toBeInTheDocument()
  })
})

describe('ProjectLabel', () => {
  it('has no accessibility violations for project scope', async () => {
    const { container } = render(<ProjectLabel projectId="proj-1" projectNameMap={projectNameMap} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders "-" when no projectId is provided', () => {
    const { container } = render(<ProjectLabel projectNameMap={projectNameMap} />)
    expect(container.textContent).toBe('-')
  })

  it('renders project name when projectId is provided', () => {
    render(<ProjectLabel projectId="proj-1" projectNameMap={projectNameMap} />)
    expect(screen.getByText('Alpha Project')).toBeInTheDocument()
  })

  it('falls back to projectId when name is not in the map', () => {
    render(<ProjectLabel projectId="unknown-id" projectNameMap={projectNameMap} />)
    expect(screen.getByText('unknown-id')).toBeInTheDocument()
  })

  it('is keyboard accessible', async () => {
    const user = userEvent.setup()
    render(<ProjectLabel projectId="proj-1" projectNameMap={projectNameMap} />)

    const button = screen.getByRole('button', { name: /alpha project/i })
    expect(button).toBeInTheDocument()

    await user.tab()
    expect(button).toHaveFocus()
  })

  it('navigates to the project detail page on click', async () => {
    const user = userEvent.setup()
    render(<ProjectLabel projectId="proj-1" projectNameMap={projectNameMap} />)

    await user.click(screen.getByRole('button', { name: /alpha project/i }))

    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('proj-1'))
  })
})
