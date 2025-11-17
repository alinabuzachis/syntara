import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EmptyStateFilter } from './EmptyStateFilter'

describe('EmptyStateFilter', () => {
  describe('Default Behavior', () => {
    it('renders with default content and no button', () => {
      render(<EmptyStateFilter />)

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('No results found')
      expect(
        screen.getByText('No results match the filter criteria. Try changing your filter settings.')
      ).toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(screen.getByRole('img')).toHaveAttribute('alt', 'No results')
    })
  })

  describe('Button Behavior', () => {
    it('renders button with default text when clearAllFilters is provided', () => {
      const clearFilters = vi.fn()
      render(<EmptyStateFilter clearAllFilters={clearFilters} />)

      expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument()
    })

    it('calls clearAllFilters when button is clicked', async () => {
      const clearFilters = vi.fn()
      const user = userEvent.setup()

      render(<EmptyStateFilter clearAllFilters={clearFilters} />)

      await user.click(screen.getByRole('button', { name: 'Clear all filters' }))

      expect(clearFilters).toHaveBeenCalledTimes(1)
    })

    it('does not render button when clearAllFilters is not provided', () => {
      render(<EmptyStateFilter buttonText="Clear Filters" />)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('Custom Props', () => {
    it('renders with custom title, description, and button text', () => {
      const clearFilters = vi.fn()

      render(
        <EmptyStateFilter
          title="No Matching Items"
          description="Your search criteria did not match any items"
          buttonText="Clear Search"
          clearAllFilters={clearFilters}
        />
      )

      expect(screen.getByText('No Matching Items')).toBeInTheDocument()
      expect(screen.getByText('Your search criteria did not match any items')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Clear Search' })).toBeInTheDocument()
    })
  })
})
