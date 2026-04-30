import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { AppPage, AppPageMain } from './AppPage'

describe('AppPage', () => {
  it('renders children', () => {
    render(
      <AppPage>
        <div data-testid="child">Child Content</div>
      </AppPage>
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Child Content')).toBeInTheDocument()
  })

  it('renders multiple children', () => {
    render(
      <AppPage>
        <div data-testid="child1">First</div>
        <div data-testid="child2">Second</div>
        <div data-testid="child3">Third</div>
      </AppPage>
    )

    expect(screen.getByTestId('child1')).toBeInTheDocument()
    expect(screen.getByTestId('child2')).toBeInTheDocument()
    expect(screen.getByTestId('child3')).toBeInTheDocument()
  })

  it('AppPageMain renders a filled stack item for main column content', () => {
    render(
      <AppPage>
        <AppPageMain data-testid="app-page-main">
          <div data-testid="main-region">Main</div>
        </AppPageMain>
      </AppPage>
    )

    expect(screen.getByTestId('main-region')).toBeInTheDocument()
    expect(screen.getByTestId('app-page-main')).toHaveClass('pf-m-fill')
  })

  it('AppPageMain applies centered flex layout when isCentered is set', () => {
    render(
      <AppPage>
        <AppPageMain data-testid="app-page-main" isCentered>
          <div>Centered</div>
        </AppPageMain>
      </AppPage>
    )

    expect(screen.getByTestId('app-page-main')).toHaveStyle({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations when AppPage wraps AppPageMain', async () => {
      const { container } = render(
        <AppPage>
          <AppPageMain>
            <main>
              <h1>Page title</h1>
              <p>Body</p>
            </main>
          </AppPageMain>
        </AppPage>
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
