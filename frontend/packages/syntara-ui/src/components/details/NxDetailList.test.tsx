import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NxDetailList } from './NxDetailList'

describe('NxDetailList', () => {
  it('renders children', () => {
    render(
      <NxDetailList>
        <div data-testid="child">Child content</div>
      </NxDetailList>
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('renders as a PatternFly DescriptionList', () => {
    render(
      <NxDetailList>
        <div>Content</div>
      </NxDetailList>
    )

    expect(screen.getByTestId('description-list')).toBeInTheDocument()
  })

  it('applies compact modifier', () => {
    render(
      <NxDetailList>
        <div>Content</div>
      </NxDetailList>
    )

    expect(screen.getByTestId('description-list')).toHaveClass('pf-m-compact')
  })

  it('applies details class', () => {
    render(
      <NxDetailList>
        <div>Content</div>
      </NxDetailList>
    )

    expect(screen.getByTestId('description-list')).toHaveClass('details')
  })

  it('renders multiple children', () => {
    render(
      <NxDetailList>
        <div data-testid="child-1">First</div>
        <div data-testid="child-2">Second</div>
        <div data-testid="child-3">Third</div>
      </NxDetailList>
    )

    expect(screen.getByTestId('child-1')).toBeInTheDocument()
    expect(screen.getByTestId('child-2')).toBeInTheDocument()
    expect(screen.getByTestId('child-3')).toBeInTheDocument()
  })

  it('forwards data-testid to the description list', () => {
    render(
      <NxDetailList data-testid="my-details">
        <div>Content</div>
      </NxDetailList>
    )

    expect(screen.getByTestId('my-details')).toBeInTheDocument()
  })

  it('renders correctly on re-render with unchanged props', () => {
    // Stable reference for children ensures React Compiler's memoization cache hits
    // on the second render, exercising the cache-check branch conditions.
    const child = <div>Stable content</div>
    const { rerender } = render(<NxDetailList data-testid="stable">{child}</NxDetailList>)

    rerender(<NxDetailList data-testid="stable">{child}</NxDetailList>)

    expect(screen.getByTestId('stable')).toBeInTheDocument()
  })

  it('applies horizontal layout when isHorizontal is true', () => {
    render(
      <NxDetailList isHorizontal data-testid="horizontal-details">
        <div>Content</div>
      </NxDetailList>
    )

    expect(screen.getByTestId('horizontal-details')).toHaveClass('pf-m-horizontal')
  })
})
