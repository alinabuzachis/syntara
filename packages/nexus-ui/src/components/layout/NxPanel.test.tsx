import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { NxPanel } from './NxPanel'

describe('NxPanel', () => {
  it('renders children', () => {
    render(<NxPanel>Panel content</NxPanel>)

    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <NxPanel hasNoPadding isFullHeight isScrollable>
        <p>Scrollable region</p>
      </NxPanel>
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
