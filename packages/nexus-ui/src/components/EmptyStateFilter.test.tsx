import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { EmptyStateFilter } from './EmptyStateFilter'

describe('EmptyStateFilter', () => {
  it('has no accessibility violations with default props', async () => {
    const { container } = render(<EmptyStateFilter />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with action button', async () => {
    const { container } = render(<EmptyStateFilter clearAllFilters={vi.fn()} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders with default title and description', () => {
    render(<EmptyStateFilter />)

    expect(screen.getByText('No results found')).toBeInTheDocument()
    expect(
      screen.getByText('No results match the filter criteria. Try changing your filter settings.')
    ).toBeInTheDocument()
  })

  it('renders with custom title', () => {
    render(<EmptyStateFilter title="Custom Title" />)

    expect(screen.getByText('Custom Title')).toBeInTheDocument()
  })

  it('renders with custom description', () => {
    render(<EmptyStateFilter description="Custom description text" />)

    expect(screen.getByText('Custom description text')).toBeInTheDocument()
  })

  it('shows clear filters button when clearAllFilters is provided', () => {
    const clearAllFilters = vi.fn()
    render(<EmptyStateFilter clearAllFilters={clearAllFilters} />)

    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument()
  })

  it('does not show clear filters button when clearAllFilters is not provided', () => {
    render(<EmptyStateFilter />)

    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument()
  })

  it('calls clearAllFilters when button is clicked', () => {
    const clearAllFilters = vi.fn()
    render(<EmptyStateFilter clearAllFilters={clearAllFilters} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect(clearAllFilters).toHaveBeenCalledTimes(1)
  })

  it('renders with custom button text', () => {
    const clearAllFilters = vi.fn()
    render(<EmptyStateFilter clearAllFilters={clearAllFilters} buttonText="Reset Filters" />)

    expect(screen.getByRole('button', { name: 'Reset Filters' })).toBeInTheDocument()
  })

  it('renders with custom image', () => {
    render(<EmptyStateFilter imageSrc="/test-image.png" imageAlt="Test alt text" />)

    const image = screen.getByRole('img', { name: 'Test alt text' })
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute('src', '/test-image.png')
  })

  it('uses default alt text for image when not provided', () => {
    render(<EmptyStateFilter imageSrc="/test-image.png" />)

    const image = screen.getByRole('img', { name: 'No results' })
    expect(image).toBeInTheDocument()
  })

  it('renders all custom props together', () => {
    const clearAllFilters = vi.fn()
    render(
      <EmptyStateFilter
        title="No Matches"
        description="Try different search terms"
        buttonText="Clear Search"
        imageSrc="/empty.png"
        imageAlt="Empty state"
        clearAllFilters={clearAllFilters}
      />
    )

    expect(screen.getByText('No Matches')).toBeInTheDocument()
    expect(screen.getByText('Try different search terms')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear Search' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Empty state' })).toBeInTheDocument()
  })
})
