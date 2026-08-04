import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ApprovalNavigationHeader } from './ApprovalNavigationHeader'

describe('ApprovalNavigationHeader', () => {
  const defaultProps = {
    title: 'Review approval',
    onClose: vi.fn(),
  }

  it('renders the title', () => {
    render(<ApprovalNavigationHeader {...defaultProps} />)
    expect(screen.getByRole('heading', { name: 'Review approval' })).toBeInTheDocument()
  })

  it('renders close button', () => {
    render(<ApprovalNavigationHeader {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<ApprovalNavigationHeader {...defaultProps} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('uses custom closeAriaLabel when provided', () => {
    render(<ApprovalNavigationHeader {...defaultProps} closeAriaLabel="Close panel" />)
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument()
  })

  describe('Navigation controls', () => {
    it('shows navigation controls when totalCount > 1', () => {
      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={0}
          totalCount={3}
          hasPrev={false}
          hasNext={true}
          onNavigatePrev={vi.fn()}
          onNavigateNext={vi.fn()}
        />
      )

      expect(screen.getByRole('button', { name: 'Previous approval' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next approval' })).toBeInTheDocument()
    })

    it('hides navigation controls when totalCount is 1', () => {
      render(<ApprovalNavigationHeader {...defaultProps} totalCount={1} currentIndex={0} />)

      expect(screen.queryByRole('button', { name: 'Previous approval' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Next approval' })).not.toBeInTheDocument()
    })

    it('hides navigation controls when totalCount is undefined', () => {
      render(<ApprovalNavigationHeader {...defaultProps} />)

      expect(screen.queryByRole('button', { name: 'Previous approval' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Next approval' })).not.toBeInTheDocument()
    })

    it('displays counter text when navigation is shown', () => {
      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={1}
          totalCount={3}
          onNavigatePrev={vi.fn()}
          onNavigateNext={vi.fn()}
        />
      )

      expect(screen.getByText('(2 of 3)')).toBeInTheDocument()
    })

    it('calls onNavigatePrev when Previous button is clicked', async () => {
      const onNavigatePrev = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={1}
          totalCount={3}
          hasPrev={true}
          hasNext={true}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={vi.fn()}
        />
      )

      await user.click(screen.getByRole('button', { name: 'Previous approval' }))
      expect(onNavigatePrev).toHaveBeenCalledTimes(1)
    })

    it('calls onNavigateNext when Next button is clicked', async () => {
      const onNavigateNext = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={1}
          totalCount={3}
          hasPrev={true}
          hasNext={true}
          onNavigatePrev={vi.fn()}
          onNavigateNext={onNavigateNext}
        />
      )

      await user.click(screen.getByRole('button', { name: 'Next approval' }))
      expect(onNavigateNext).toHaveBeenCalledTimes(1)
    })

    it('disables Previous button when hasPrev is false', () => {
      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={0}
          totalCount={3}
          hasPrev={false}
          hasNext={true}
          onNavigatePrev={vi.fn()}
          onNavigateNext={vi.fn()}
        />
      )

      expect(screen.getByRole('button', { name: 'Previous approval' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('disables Next button when hasNext is false', () => {
      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={2}
          totalCount={3}
          hasPrev={true}
          hasNext={false}
          onNavigatePrev={vi.fn()}
          onNavigateNext={vi.fn()}
        />
      )

      expect(screen.getByRole('button', { name: 'Next approval' })).toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('Keyboard navigation', () => {
    it('navigates with ArrowLeft key when hasPrev is true', async () => {
      const onNavigatePrev = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={1}
          totalCount={3}
          hasPrev={true}
          hasNext={true}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={vi.fn()}
        />
      )

      // Tab to the focusable container element
      await user.tab()
      await user.keyboard('{ArrowLeft}')
      expect(onNavigatePrev).toHaveBeenCalledTimes(1)
    })

    it('navigates with ArrowRight key when hasNext is true', async () => {
      const onNavigateNext = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={1}
          totalCount={3}
          hasPrev={true}
          hasNext={true}
          onNavigatePrev={vi.fn()}
          onNavigateNext={onNavigateNext}
        />
      )

      // Tab to the focusable container element
      await user.tab()
      await user.keyboard('{ArrowRight}')
      expect(onNavigateNext).toHaveBeenCalledTimes(1)
    })

    it('does not navigate with ArrowLeft when hasPrev is false', async () => {
      const onNavigatePrev = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={0}
          totalCount={3}
          hasPrev={false}
          hasNext={true}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={vi.fn()}
        />
      )

      // Tab to the focusable container element
      await user.tab()
      await user.keyboard('{ArrowLeft}')
      expect(onNavigatePrev).not.toHaveBeenCalled()
    })

    it('does not navigate with ArrowRight when hasNext is false', async () => {
      const onNavigateNext = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={2}
          totalCount={3}
          hasPrev={true}
          hasNext={false}
          onNavigatePrev={vi.fn()}
          onNavigateNext={onNavigateNext}
        />
      )

      // Tab to the focusable container element
      await user.tab()
      await user.keyboard('{ArrowRight}')
      expect(onNavigateNext).not.toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations when navigation is hidden', async () => {
      const { container } = render(<ApprovalNavigationHeader {...defaultProps} />)
      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations when navigation is shown', async () => {
      const { container } = render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={1}
          totalCount={3}
          hasPrev={true}
          hasNext={true}
          onNavigatePrev={vi.fn()}
          onNavigateNext={vi.fn()}
        />
      )
      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations with disabled navigation buttons', async () => {
      const { container } = render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={0}
          totalCount={3}
          hasPrev={false}
          hasNext={true}
          onNavigatePrev={vi.fn()}
          onNavigateNext={vi.fn()}
        />
      )
      expect(await axe(container)).toHaveNoViolations()
    })
  })

  describe('Keyboard navigation edge cases', () => {
    it('does nothing when ArrowLeft is pressed but hasPrev is false', async () => {
      const onNavigatePrev = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={0}
          totalCount={3}
          hasPrev={false}
          hasNext={true}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={vi.fn()}
        />
      )

      // Tab to focus the navigation container, then press ArrowLeft
      await user.tab()
      await user.keyboard('{ArrowLeft}')

      expect(onNavigatePrev).not.toHaveBeenCalled()
    })

    it('does nothing when ArrowRight is pressed but hasNext is false', async () => {
      const onNavigateNext = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={2}
          totalCount={3}
          hasPrev={true}
          hasNext={false}
          onNavigatePrev={vi.fn()}
          onNavigateNext={onNavigateNext}
        />
      )

      // Tab to focus the navigation container, then press ArrowRight
      await user.tab()
      await user.keyboard('{ArrowRight}')

      expect(onNavigateNext).not.toHaveBeenCalled()
    })

    it('ignores other keys when navigation is shown', async () => {
      const onNavigatePrev = vi.fn()
      const onNavigateNext = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={1}
          totalCount={3}
          hasPrev={true}
          hasNext={true}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={onNavigateNext}
        />
      )

      // Tab to focus the navigation container, then press other keys
      await user.tab()
      await user.keyboard('{Enter}')
      await user.keyboard('{Space}')
      await user.keyboard('{Escape}')

      expect(onNavigatePrev).not.toHaveBeenCalled()
      expect(onNavigateNext).not.toHaveBeenCalled()
    })

    it('does nothing when keyboard events fire without navigation', async () => {
      const user = userEvent.setup()

      render(<ApprovalNavigationHeader {...defaultProps} totalCount={1} />)

      // Try keyboard navigation when navigation is not shown
      await user.keyboard('{ArrowLeft}')
      await user.keyboard('{ArrowRight}')

      // No navigation buttons should be rendered
      expect(screen.queryByRole('button', { name: 'Previous approval' })).not.toBeInTheDocument()
    })

    it('does not call onClick when disabled Previous button is clicked', async () => {
      const onNavigatePrev = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={0}
          totalCount={3}
          hasPrev={false}
          hasNext={true}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={vi.fn()}
        />
      )

      const prevButton = screen.getByRole('button', { name: 'Previous approval' })
      await user.click(prevButton)

      expect(onNavigatePrev).not.toHaveBeenCalled()
    })

    it('does not call onClick when disabled Next button is clicked', async () => {
      const onNavigateNext = vi.fn()
      const user = userEvent.setup()

      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={2}
          totalCount={3}
          hasPrev={true}
          hasNext={false}
          onNavigatePrev={vi.fn()}
          onNavigateNext={onNavigateNext}
        />
      )

      const nextButton = screen.getByRole('button', { name: 'Next approval' })
      await user.click(nextButton)

      expect(onNavigateNext).not.toHaveBeenCalled()
    })
  })

  describe('Navigation props edge cases', () => {
    it('hides navigation when onNavigatePrev is missing', () => {
      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={1}
          totalCount={3}
          onNavigateNext={vi.fn()}
          // onNavigatePrev is missing
        />
      )

      expect(screen.queryByRole('button', { name: 'Previous approval' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Next approval' })).not.toBeInTheDocument()
    })

    it('hides navigation when onNavigateNext is missing', () => {
      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          currentIndex={1}
          totalCount={3}
          onNavigatePrev={vi.fn()}
          // onNavigateNext is missing
        />
      )

      expect(screen.queryByRole('button', { name: 'Previous approval' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Next approval' })).not.toBeInTheDocument()
    })

    it('hides counter when currentIndex is undefined', () => {
      render(
        <ApprovalNavigationHeader
          {...defaultProps}
          totalCount={3}
          onNavigatePrev={vi.fn()}
          onNavigateNext={vi.fn()}
          // currentIndex is undefined
        />
      )

      // Navigation buttons should show
      expect(screen.getByRole('button', { name: 'Previous approval' })).toBeInTheDocument()
      // But counter should not
      expect(screen.queryByText(/of 3/)).not.toBeInTheDocument()
    })
  })

  describe('Icon rendering', () => {
    it('renders with custom icon', () => {
      const TestIcon = () => <svg data-testid="custom-icon" />
      render(<ApprovalNavigationHeader {...defaultProps} icon={<TestIcon />} />)

      expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
    })

    it('renders without icon', () => {
      render(<ApprovalNavigationHeader {...defaultProps} />)

      // Title should still be there
      expect(screen.getByRole('heading', { name: 'Review approval' })).toBeInTheDocument()
      // No custom icon
      expect(screen.queryByTestId('custom-icon')).not.toBeInTheDocument()
    })
  })
})
