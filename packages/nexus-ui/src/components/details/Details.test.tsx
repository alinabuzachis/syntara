import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Details } from './Details'

describe('Details', () => {
  it('renders children', () => {
    render(
      <Details>
        <div data-testid="child">Child content</div>
      </Details>
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('renders as a PatternFly DescriptionList', () => {
    const { container } = render(
      <Details>
        <div>Content</div>
      </Details>
    )

    const descriptionList = container.querySelector('.pf-v6-c-description-list')
    expect(descriptionList).toBeInTheDocument()
  })

  it('applies compact modifier', () => {
    const { container } = render(
      <Details>
        <div>Content</div>
      </Details>
    )

    const descriptionList = container.querySelector('.pf-v6-c-description-list')
    expect(descriptionList).toHaveClass('pf-m-compact')
  })

  it('applies details class', () => {
    const { container } = render(
      <Details>
        <div>Content</div>
      </Details>
    )

    const descriptionList = container.querySelector('.pf-v6-c-description-list')
    expect(descriptionList).toHaveClass('details')
  })

  it('renders multiple children', () => {
    render(
      <Details>
        <div data-testid="child-1">First</div>
        <div data-testid="child-2">Second</div>
        <div data-testid="child-3">Third</div>
      </Details>
    )

    expect(screen.getByTestId('child-1')).toBeInTheDocument()
    expect(screen.getByTestId('child-2')).toBeInTheDocument()
    expect(screen.getByTestId('child-3')).toBeInTheDocument()
  })
})
