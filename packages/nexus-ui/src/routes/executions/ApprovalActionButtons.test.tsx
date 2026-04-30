import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

import { ApprovalActionButtons } from './ApprovalActionButtons'

describe('ApprovalActionButtons', () => {
  const defaultProps = {
    onReviewClick: vi.fn(),
  }

  it('renders Review approval button', () => {
    render(<ApprovalActionButtons {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'Review approval' })).toBeInTheDocument()
  })

  it('calls onReviewClick when Review approval is clicked', async () => {
    const user = userEvent.setup()
    const onReviewClick = vi.fn()

    render(<ApprovalActionButtons onReviewClick={onReviewClick} />)

    await user.click(screen.getByRole('button', { name: 'Review approval' }))
    expect(onReviewClick).toHaveBeenCalledOnce()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ApprovalActionButtons {...defaultProps} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
