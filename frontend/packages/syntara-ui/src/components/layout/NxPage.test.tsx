import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { NxPage, NxPageBody } from './NxPage'

describe('NxPage', () => {
  it('renders children', () => {
    render(
      <NxPage>
        <div data-testid="child">Child Content</div>
      </NxPage>
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Child Content')).toBeInTheDocument()
  })

  it('renders multiple children', () => {
    render(
      <NxPage>
        <div data-testid="child1">First</div>
        <div data-testid="child2">Second</div>
        <div data-testid="child3">Third</div>
      </NxPage>
    )

    expect(screen.getByTestId('child1')).toBeInTheDocument()
    expect(screen.getByTestId('child2')).toBeInTheDocument()
    expect(screen.getByTestId('child3')).toBeInTheDocument()
  })

  it('NxPageBody renders a filled stack item for main column content', () => {
    render(
      <NxPage>
        <NxPageBody data-testid="app-page-main">
          <div data-testid="main-region">Main</div>
        </NxPageBody>
      </NxPage>
    )

    expect(screen.getByTestId('main-region')).toBeInTheDocument()
    expect(screen.getByTestId('app-page-main')).toHaveClass('pf-m-fill')
  })

  it('NxPageBody applies centered flex layout when isCentered is set', () => {
    render(
      <NxPage>
        <NxPageBody data-testid="app-page-main" isCentered>
          <div>Centered</div>
        </NxPageBody>
      </NxPage>
    )

    expect(screen.getByTestId('app-page-main')).toHaveStyle({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations when NxPage wraps NxPageBody', async () => {
      const { container } = render(
        <NxPage>
          <NxPageBody>
            <main>
              <h1>Page title</h1>
              <p>Body</p>
            </main>
          </NxPageBody>
        </NxPage>
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
