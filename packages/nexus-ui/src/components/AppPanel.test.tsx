import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { AppPanel } from './AppPanel'

describe('AppPanel', () => {
  it('renders children', () => {
    render(<AppPanel>Panel content</AppPanel>)

    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <AppPanel hasNoPadding isFullHeight isScrollable>
        <p>Scrollable region</p>
      </AppPanel>
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
