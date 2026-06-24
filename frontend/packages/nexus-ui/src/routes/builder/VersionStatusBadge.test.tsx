import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { VersionStatusBadge, type VersionStatus } from './VersionStatusBadge'

describe('VersionStatusBadge', () => {
  it.each<{ status: VersionStatus; label: string }>([
    { status: 'draft', label: 'Draft' },
    { status: 'published', label: 'Published' },
    { status: 'previously_published', label: 'Prev. published' },
  ])('renders "$label" for status "$status"', ({ status, label }) => {
    render(<VersionStatusBadge status={status} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<VersionStatusBadge status="published" />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
