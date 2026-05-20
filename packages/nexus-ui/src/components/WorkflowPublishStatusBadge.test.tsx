import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { derivePublishStatus } from './publishStatusUtils'
import { WorkflowPublishStatusBadge } from './WorkflowPublishStatusBadge'

describe('derivePublishStatus', () => {
  it('returns "unpublished" when published_version is null', () => {
    expect(derivePublishStatus(null, 1)).toBe('unpublished')
  })

  it('returns "unpublished" when published_version is undefined', () => {
    expect(derivePublishStatus(undefined, 1)).toBe('unpublished')
  })

  it('returns "published" when published_version equals current_version', () => {
    expect(derivePublishStatus(3, 3)).toBe('published')
  })

  it('returns "unpublished_changes" when published_version is behind current_version', () => {
    expect(derivePublishStatus(2, 3)).toBe('unpublished_changes')
  })

  it('returns "unpublished_changes" when published_version differs from current_version', () => {
    expect(derivePublishStatus(1, 5)).toBe('unpublished_changes')
  })

  it('returns "unpublished" when both are undefined', () => {
    expect(derivePublishStatus(undefined, undefined)).toBe('unpublished')
  })
})

describe('WorkflowPublishStatusBadge', () => {
  it('renders "Draft" when unpublished', () => {
    render(<WorkflowPublishStatusBadge publishedVersion={null} currentVersion={1} />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders "Published" when versions match', () => {
    render(<WorkflowPublishStatusBadge publishedVersion={2} currentVersion={2} />)
    expect(screen.getByText('Published')).toBeInTheDocument()
  })

  it('renders "Unpublished changes" when versions differ', () => {
    render(<WorkflowPublishStatusBadge publishedVersion={1} currentVersion={2} />)
    expect(screen.getByText('Unpublished changes')).toBeInTheDocument()
  })

  it('has no accessibility violations in unpublished state', async () => {
    const { container } = render(<WorkflowPublishStatusBadge publishedVersion={null} currentVersion={1} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations in published state', async () => {
    const { container } = render(<WorkflowPublishStatusBadge publishedVersion={2} currentVersion={2} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations in unpublished changes state', async () => {
    const { container } = render(<WorkflowPublishStatusBadge publishedVersion={1} currentVersion={3} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders correct label text for each badge state', () => {
    // Published state
    const { unmount: u1 } = render(<WorkflowPublishStatusBadge publishedVersion={3} currentVersion={3} />)
    expect(screen.getByText('Published')).toBeInTheDocument()
    u1()

    // Unpublished changes state
    const { unmount: u2 } = render(<WorkflowPublishStatusBadge publishedVersion={1} currentVersion={3} />)
    expect(screen.getByText('Unpublished changes')).toBeInTheDocument()
    u2()

    // Draft state (uses color prop instead of status prop in the discriminated union)
    render(<WorkflowPublishStatusBadge publishedVersion={null} currentVersion={1} />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders draft when both versions are undefined', () => {
    render(<WorkflowPublishStatusBadge publishedVersion={undefined} currentVersion={undefined} />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })
})
