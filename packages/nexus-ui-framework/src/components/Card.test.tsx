import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('renders children correctly', () => {
    render(<Card>Test Content</Card>)
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('applies glass variant by default', () => {
    const { container } = render(<Card>Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('glass', 'border', 'rounded-lg')
  })

  it('applies solid variant', () => {
    const { container } = render(<Card variant="solid">Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('bg-white/5', 'border', 'border-white/10', 'rounded-lg')
  })

  it('applies outline variant', () => {
    const { container } = render(<Card variant="outline">Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('border', 'border-white/20', 'rounded-lg')
  })

  it('applies medium padding by default', () => {
    const { container } = render(<Card>Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('p-4')
  })

  it('applies none padding', () => {
    const { container } = render(<Card padding="none">Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('p-0')
  })

  it('applies small padding', () => {
    const { container } = render(<Card padding="sm">Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('p-3')
  })

  it('applies large padding', () => {
    const { container } = render(<Card padding="lg">Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('p-6')
  })

  it('accepts custom className', () => {
    const { container } = render(<Card className="custom-class">Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('custom-class')
  })

  it('accepts additional HTML div attributes', () => {
    render(
      <Card data-testid="test-card" id="my-card">
        Content
      </Card>
    )
    const card = screen.getByTestId('test-card')
    expect(card).toHaveAttribute('id', 'my-card')
  })

  it('combines variant, padding, and custom classes', () => {
    const { container } = render(
      <Card variant="solid" padding="lg" className="flex flex-col gap-4">
        Content
      </Card>
    )
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass(
      'bg-white/5',
      'border',
      'border-white/10',
      'rounded-lg',
      'p-6',
      'flex',
      'flex-col',
      'gap-4'
    )
  })
})
