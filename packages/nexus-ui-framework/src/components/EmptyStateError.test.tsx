import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EmptyStateError } from './EmptyStateError'

describe('EmptyStateError', () => {
  describe('Default Behavior', () => {
    it('renders with default content and refresh button', () => {
      render(<EmptyStateError />)

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Something went wrong')
      expect(screen.getByText('Please refresh the page by using the button below.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('reloads window when refresh button is clicked', async () => {
      const reloadMock = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      })

      const user = userEvent.setup()
      render(<EmptyStateError />)

      await user.click(screen.getByRole('button', { name: 'Refresh' }))

      expect(reloadMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('Custom Props', () => {
    it('renders with custom title, description, and button text', () => {
      render(
        <EmptyStateError
          title="Network Error"
          description="Unable to connect to server"
          buttonText="Retry Connection"
        />
      )

      expect(screen.getByText('Network Error')).toBeInTheDocument()
      expect(screen.getByText('Unable to connect to server')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry Connection' })).toBeInTheDocument()
    })

    it('allows partial customization with defaults for other props', () => {
      render(<EmptyStateError title="Custom Error" />)

      expect(screen.getByText('Custom Error')).toBeInTheDocument()
      expect(screen.getByText('Please refresh the page by using the button below.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    })

    it('renders with custom image when imageSrc is provided', () => {
      render(<EmptyStateError imageSrc="/test-image.png" imageAlt="Custom error image" />)

      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('src', '/test-image.png')
      expect(img).toHaveAttribute('alt', 'Custom error image')
    })

    it('uses default alt text when imageSrc is provided without imageAlt', () => {
      render(<EmptyStateError imageSrc="/test-image.png" />)

      expect(screen.getByRole('img')).toHaveAttribute('alt', 'Error')
    })
  })
})
