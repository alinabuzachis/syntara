import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EmptyStateNoData } from './EmptyStateNoData'

describe('EmptyStateNoData', () => {
  describe('Default Behavior', () => {
    it('renders with default content and no button', () => {
      render(<EmptyStateNoData />)

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('No data available')
      expect(screen.getByText('There is no data to display at this time.')).toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(screen.getByRole('img')).toHaveAttribute('alt', 'No data')
    })
  })

  describe('Button Behavior', () => {
    it('renders button with default text when addData is provided', () => {
      const addData = vi.fn()
      render(<EmptyStateNoData addData={addData} />)

      expect(screen.getByRole('button', { name: 'Add data' })).toBeInTheDocument()
    })

    it('calls addData when button is clicked', async () => {
      const addData = vi.fn()
      const user = userEvent.setup()

      render(<EmptyStateNoData addData={addData} />)

      await user.click(screen.getByRole('button', { name: 'Add data' }))

      expect(addData).toHaveBeenCalledTimes(1)
    })

    it('does not render button when addData is not provided', () => {
      render(<EmptyStateNoData buttonText="Create New Item" />)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('Custom Props', () => {
    it('renders with custom title, description, and button text', () => {
      const addData = vi.fn()

      render(
        <EmptyStateNoData
          title="Empty Database"
          description="Start by adding your first record"
          buttonText="Add Record"
          addData={addData}
        />
      )

      expect(screen.getByText('Empty Database')).toBeInTheDocument()
      expect(screen.getByText('Start by adding your first record')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add Record' })).toBeInTheDocument()
    })
  })
})
