import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  const defaultProps = {
    title: 'Test Title',
    description: 'Test Description',
  }

  describe('Basic Rendering', () => {
    it('renders title and description', () => {
      render(<EmptyState {...defaultProps} />)

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Test Title')
      expect(screen.getByText('Test Description')).toBeInTheDocument()
    })

    it('renders image with src and alt when provided', () => {
      render(<EmptyState {...defaultProps} imageSrc="/test-image.png" imageAlt="Test Alt" />)

      const image = screen.getByRole('img')
      expect(image).toHaveAttribute('src', '/test-image.png')
      expect(image).toHaveAttribute('alt', 'Test Alt')
    })

    it('does not render image when imageSrc is not provided', () => {
      render(<EmptyState {...defaultProps} />)

      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })
  })

  describe('Button Behavior', () => {
    it('renders and calls onClick when both buttonText and onButtonClick are provided', async () => {
      const handleClick = vi.fn()
      const user = userEvent.setup()

      render(<EmptyState {...defaultProps} buttonText="Click Me" onButtonClick={handleClick} />)

      const button = screen.getByRole('button', { name: 'Click Me' })
      await user.click(button)

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('does not render button when only buttonText is provided', () => {
      render(<EmptyState {...defaultProps} buttonText="Click Me" />)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('does not render button when only onButtonClick is provided', () => {
      render(<EmptyState {...defaultProps} onButtonClick={vi.fn()} />)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('Complete Component', () => {
    it('renders all optional props together', () => {
      const handleClick = vi.fn()

      render(
        <EmptyState
          title="Complete Title"
          description="Complete Description"
          imageSrc="/complete-image.png"
          imageAlt="Complete Alt"
          buttonText="Complete Button"
          onButtonClick={handleClick}
          className="complete-class"
        />
      )

      expect(screen.getByText('Complete Title')).toBeInTheDocument()
      expect(screen.getByText('Complete Description')).toBeInTheDocument()
      expect(screen.getByRole('img')).toHaveAttribute('src', '/complete-image.png')
      expect(screen.getByRole('button', { name: 'Complete Button' })).toBeInTheDocument()
    })
  })
})
