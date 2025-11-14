import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SelectableCardList } from './SelectableCardList'

describe('SelectableCardList', () => {
  it('renders children', () => {
    render(
      <SelectableCardList>
        <div>Item 1</div>
        <div>Item 2</div>
      </SelectableCardList>
    )
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
  })

  it('applies default gap-1.5 class', () => {
    const { container } = render(
      <SelectableCardList>
        <div>Item 1</div>
      </SelectableCardList>
    )
    const listContainer = container.firstChild
    expect(listContainer).toHaveClass('gap-1.5')
  })

  it('applies custom gap class', () => {
    const { container } = render(
      <SelectableCardList gap="gap-4">
        <div>Item 1</div>
      </SelectableCardList>
    )
    const listContainer = container.firstChild
    expect(listContainer).toHaveClass('gap-4')
  })

  it('applies custom className', () => {
    const { container } = render(
      <SelectableCardList className="custom-class">
        <div>Item 1</div>
      </SelectableCardList>
    )
    const listContainer = container.firstChild
    expect(listContainer).toHaveClass('custom-class')
  })

  it('always has flex and flex-col classes', () => {
    const { container } = render(
      <SelectableCardList>
        <div>Item 1</div>
      </SelectableCardList>
    )
    const listContainer = container.firstChild
    expect(listContainer).toHaveClass('flex', 'flex-col')
  })
})
