import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { DetailPageShell } from './DetailPageShell'

describe('DetailPageShell', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(
      <DetailPageShell title="Test Title">
        <p>Test content</p>
      </DetailPageShell>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders the title and children', () => {
    render(
      <DetailPageShell title="Project Details">
        <p>Some content here</p>
      </DetailPageShell>
    )
    expect(screen.getByText('Project Details')).toBeInTheDocument()
    expect(screen.getByText('Some content here')).toBeInTheDocument()
  })
})
