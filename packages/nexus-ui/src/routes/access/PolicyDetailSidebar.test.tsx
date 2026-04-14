import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { PolicyDetailSidebar } from './PolicyDetailSidebar'
import type { PolicyRead } from './types'

vi.mock('../../components/details/CodeBlock', () => ({
  CodeBlock: ({ jsonObject }: { jsonObject: unknown }) => <pre>{JSON.stringify(jsonObject)}</pre>,
}))

const builtinPolicy: PolicyRead = {
  id: 'p1',
  name: 'admin-policy',
  description: 'Full admin access to all resources',
  statements: [
    {
      scope: 'any',
      effect: 'allow',
      actions: ['workflow:read', 'workflow:write'],
    },
    {
      scope: 'self',
      effect: 'deny',
      actions: ['workflow:delete'],
      conditions: { ip_range: '10.0.0.0/8' },
    },
  ],
  is_builtin: true,
  project_id: null,
  labels: { env: 'production', team: 'platform' },
  created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-06-20T14:45:00Z',
}

const customPolicy: PolicyRead = {
  id: 'p2',
  name: 'viewer-policy',
  description: null,
  statements: [
    {
      scope: 'self',
      effect: 'allow',
      actions: ['workflow:read'],
    },
  ],
  is_builtin: false,
  project_id: 'proj-1',
  labels: {},
  created_at: null,
  updated_at: null,
}

const emptyStatementsPolicy: PolicyRead = {
  id: 'p3',
  name: 'empty-policy',
  description: 'No statements',
  statements: [],
  is_builtin: false,
  project_id: null,
  labels: {},
  created_at: null,
  updated_at: null,
}

describe('PolicyDetailSidebar', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders policy name and heading', () => {
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    expect(screen.getByRole('heading', { name: 'Policy details' })).toBeInTheDocument()
    expect(screen.getByText('admin-policy')).toBeInTheDocument()
  })

  it('renders Built-in label for builtin policy', () => {
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    expect(screen.getByText('Built-in')).toBeInTheDocument()
    expect(screen.getByText('This is a system policy and cannot be modified.')).toBeInTheDocument()
  })

  it('renders Custom label for custom policy', () => {
    render(<PolicyDetailSidebar policy={customPolicy} onClose={onClose} />)

    expect(screen.getByText('Custom')).toBeInTheDocument()
    expect(screen.queryByText('This is a system policy and cannot be modified.')).not.toBeInTheDocument()
  })

  it('renders policy description when present', () => {
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    expect(screen.getByText('Full admin access to all resources')).toBeInTheDocument()
  })

  it('does not render description when null', () => {
    render(<PolicyDetailSidebar policy={customPolicy} onClose={onClose} />)

    // The description paragraph should not be in the DOM
    expect(screen.queryByText('Full admin access to all resources')).not.toBeInTheDocument()
  })

  it('renders scope as Global when no project_id', () => {
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    expect(screen.getByText('Global')).toBeInTheDocument()
  })

  it('renders scope with project ID when project_id exists', () => {
    render(<PolicyDetailSidebar policy={customPolicy} onClose={onClose} />)

    expect(screen.getByText('Project: proj-1')).toBeInTheDocument()
  })

  it('renders timestamps', () => {
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('Updated')).toBeInTheDocument()
  })

  it('renders N/A for null timestamps', () => {
    render(<PolicyDetailSidebar policy={customPolicy} onClose={onClose} />)

    const naTexts = screen.getAllByText('N/A')
    expect(naTexts.length).toBeGreaterThanOrEqual(2)
  })

  it('renders labels when present', () => {
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    expect(screen.getByText('Labels')).toBeInTheDocument()
    expect(screen.getByText('env: production')).toBeInTheDocument()
    expect(screen.getByText('team: platform')).toBeInTheDocument()
  })

  it('does not render labels section when empty', () => {
    render(<PolicyDetailSidebar policy={customPolicy} onClose={onClose} />)

    expect(screen.queryByText('Labels')).not.toBeInTheDocument()
  })

  it('renders statements with effect and actions', () => {
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    expect(screen.getByRole('heading', { name: 'Statements' })).toBeInTheDocument()
    expect(screen.getByText('ALLOW')).toBeInTheDocument()
    expect(screen.getByText('DENY')).toBeInTheDocument()
    expect(screen.getByText('workflow:read')).toBeInTheDocument()
    expect(screen.getByText('workflow:write')).toBeInTheDocument()
    expect(screen.getByText('workflow:delete')).toBeInTheDocument()
  })

  it('renders statement scope labels', () => {
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    expect(screen.getByText('scope: any')).toBeInTheDocument()
    expect(screen.getByText('scope: self')).toBeInTheDocument()
  })

  it('renders conditions when present', () => {
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    expect(screen.getByText('Conditions:')).toBeInTheDocument()
    // CodeBlock is mocked as <pre>, so look for JSON content
    expect(screen.getByText(JSON.stringify({ ip_range: '10.0.0.0/8' }))).toBeInTheDocument()
  })

  it('renders "No statements defined." when statements are empty', () => {
    render(<PolicyDetailSidebar policy={emptyStatementsPolicy} onClose={onClose} />)

    expect(screen.getByText('No statements defined.')).toBeInTheDocument()
  })

  it('renders Policy JSON section', () => {
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    expect(screen.getByRole('heading', { name: 'Policy JSON' })).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close policy details' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape key is pressed', async () => {
    const user = userEvent.setup()
    render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('cleans up keyboard listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)
    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeEventListenerSpy.mockRestore()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<PolicyDetailSidebar policy={builtinPolicy} onClose={onClose} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations for custom policy', async () => {
    const { container } = render(<PolicyDetailSidebar policy={customPolicy} onClose={onClose} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
