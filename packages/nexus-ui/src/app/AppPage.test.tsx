import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppPage } from './AppPage'

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

  it('renders as a Stack with gutter', () => {
    const { container } = render(
      <AppPage>
        <div>Content</div>
      </AppPage>
    )

    const stack = container.querySelector('.pf-v6-l-stack')
    expect(stack).toBeInTheDocument()
  })
})
