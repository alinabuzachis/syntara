import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Heading } from './Heading'

describe('Heading', () => {
  it('renders children correctly', () => {
    render(<Heading>Test Heading</Heading>)
    expect(screen.getByText('Test Heading')).toBeInTheDocument()
  })

  it('renders h2 by default', () => {
    render(<Heading>Heading</Heading>)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toBeInTheDocument()
  })

  it('renders correct heading level', () => {
    render(<Heading level={1}>H1 Heading</Heading>)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toBeInTheDocument()
  })

  it('renders all heading levels correctly', () => {
    const { rerender } = render(<Heading level={1}>H1</Heading>)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()

    rerender(<Heading level={2}>H2</Heading>)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()

    rerender(<Heading level={3}>H3</Heading>)
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()

    rerender(<Heading level={4}>H4</Heading>)
    expect(screen.getByRole('heading', { level: 4 })).toBeInTheDocument()

    rerender(<Heading level={5}>H5</Heading>)
    expect(screen.getByRole('heading', { level: 5 })).toBeInTheDocument()

    rerender(<Heading level={6}>H6</Heading>)
    expect(screen.getByRole('heading', { level: 6 })).toBeInTheDocument()
  })

  it('applies default size based on level', () => {
    const { container, rerender } = render(<Heading level={1}>H1</Heading>)
    expect(container.firstChild).toHaveClass('text-2xl')

    rerender(<Heading level={2}>H2</Heading>)
    expect(container.firstChild).toHaveClass('text-xl')

    rerender(<Heading level={3}>H3</Heading>)
    expect(container.firstChild).toHaveClass('text-lg')

    rerender(<Heading level={4}>H4</Heading>)
    expect(container.firstChild).toHaveClass('text-base')

    rerender(<Heading level={5}>H5</Heading>)
    expect(container.firstChild).toHaveClass('text-sm')

    rerender(<Heading level={6}>H6</Heading>)
    expect(container.firstChild).toHaveClass('text-xs')
  })

  it('allows custom size override', () => {
    const { container } = render(
      <Heading level={3} size="sm">
        Small H3
      </Heading>
    )
    expect(container.firstChild).toHaveClass('text-sm')
  })

  it('applies semibold weight by default', () => {
    const { container } = render(<Heading>Heading</Heading>)
    expect(container.firstChild).toHaveClass('font-semibold')
  })

  it('applies all weight options correctly', () => {
    const { container, rerender } = render(<Heading weight="normal">Normal</Heading>)
    expect(container.firstChild).toHaveClass('font-normal')

    rerender(<Heading weight="medium">Medium</Heading>)
    expect(container.firstChild).toHaveClass('font-medium')

    rerender(<Heading weight="semibold">Semibold</Heading>)
    expect(container.firstChild).toHaveClass('font-semibold')

    rerender(<Heading weight="bold">Bold</Heading>)
    expect(container.firstChild).toHaveClass('font-bold')
  })

  it('accepts custom className', () => {
    const { container } = render(<Heading className="text-blue-500">Heading</Heading>)
    expect(container.firstChild).toHaveClass('text-blue-500')
  })

  it('accepts additional HTML heading attributes', () => {
    render(
      <Heading data-testid="test-heading" id="my-heading">
        Heading
      </Heading>
    )
    const heading = screen.getByTestId('test-heading')
    expect(heading).toHaveAttribute('id', 'my-heading')
  })

  it('combines level, size, weight, and custom classes', () => {
    const { container } = render(
      <Heading level={3} size="sm" weight="bold" className="text-blue-500 underline">
        Custom Heading
      </Heading>
    )
    expect(container.firstChild).toHaveClass('text-sm', 'font-bold', 'text-blue-500', 'underline')
  })
})
