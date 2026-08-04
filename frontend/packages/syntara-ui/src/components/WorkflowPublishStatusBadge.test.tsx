import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { derivePublishStatus } from './publishStatusUtils'
import { WorkflowPublishStatusBadge } from './WorkflowPublishStatusBadge'

describe('derivePublishStatus', () => {
  it('returns "unpublished" when published_version_id is null', () => {
    expect(derivePublishStatus(null)).toBe('unpublished')
  })

  it('returns "unpublished" when published_version_id is undefined', () => {
    expect(derivePublishStatus(undefined)).toBe('unpublished')
  })

  it('returns "published" when published_version_id is set and no currentVersionId', () => {
    expect(derivePublishStatus('ver-3')).toBe('published')
  })

  it('returns "published" when currentVersionId matches publishedVersionId', () => {
    expect(derivePublishStatus('ver-2', 'ver-2')).toBe('published')
  })

  it('returns "unpublished_changes" when currentVersionId differs from publishedVersionId', () => {
    expect(derivePublishStatus('ver-2', 'ver-3')).toBe('unpublished_changes')
  })

  it('returns "unpublished" when publishedVersionId is null even with currentVersionId', () => {
    expect(derivePublishStatus(null, 'ver-1')).toBe('unpublished')
  })
})

describe('WorkflowPublishStatusBadge', () => {
  it('renders "Draft" when unpublished', () => {
    render(<WorkflowPublishStatusBadge publishedVersionId={null} />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders "Published" when published_version_id matches current version', () => {
    render(<WorkflowPublishStatusBadge publishedVersionId="ver-2" currentVersionId="ver-2" />)
    expect(screen.getByText('Published')).toBeInTheDocument()
  })

  it('renders "Unpublished changes" when current version differs from published', () => {
    render(<WorkflowPublishStatusBadge publishedVersionId="ver-2" currentVersionId="ver-3" />)
    expect(screen.getByText('Unpublished changes')).toBeInTheDocument()
  })

  it('renders "Published" when no currentVersionId is provided', () => {
    render(<WorkflowPublishStatusBadge publishedVersionId="ver-2" />)
    expect(screen.getByText('Published')).toBeInTheDocument()
  })

  it('has no accessibility violations in unpublished state', async () => {
    const { container } = render(<WorkflowPublishStatusBadge publishedVersionId={null} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations in published state', async () => {
    const { container } = render(<WorkflowPublishStatusBadge publishedVersionId="ver-2" currentVersionId="ver-2" />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations in unpublished_changes state', async () => {
    const { container } = render(<WorkflowPublishStatusBadge publishedVersionId="ver-2" currentVersionId="ver-3" />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders draft when published_version_id is undefined', () => {
    render(<WorkflowPublishStatusBadge publishedVersionId={undefined} />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders "Unpublished changes" via hasUnpublishedChanges prop (list view)', () => {
    render(<WorkflowPublishStatusBadge publishedVersionId="ver-2" hasUnpublishedChanges />)
    expect(screen.getByText('Unpublished changes')).toBeInTheDocument()
  })

  it('renders "Draft" when hasUnpublishedChanges is true but no published version', () => {
    render(<WorkflowPublishStatusBadge publishedVersionId={null} hasUnpublishedChanges />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })
})
