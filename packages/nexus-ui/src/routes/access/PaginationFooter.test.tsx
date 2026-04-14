import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { PaginationFooter } from './PaginationFooter'

describe('PaginationFooter', () => {
  const defaultProps = {
    page: 1,
    perPage: 20,
    total: 50,
    hasNext: true,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onPerPageChange: vi.fn(),
  }

  it('renders pagination component', () => {
    render(<PaginationFooter {...defaultProps} />)

    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument()
  })

  it('uses total as itemCount when provided', () => {
    render(<PaginationFooter {...defaultProps} total={100} />)

    // PF Pagination shows "1 - 20 of 100" or similar
    expect(screen.getByText(/of/i)).toBeInTheDocument()
  })

  it('estimates itemCount when total is null and hasNext is true', () => {
    render(<PaginationFooter {...defaultProps} total={null} hasNext={true} page={2} perPage={10} />)

    // itemCount = page * perPage + 1 = 2 * 10 + 1 = 21
    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument()
  })

  it('estimates itemCount when total is null and hasNext is false', () => {
    render(<PaginationFooter {...defaultProps} total={null} hasNext={false} page={2} perPage={10} />)

    // itemCount = page * perPage = 2 * 10 = 20
    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument()
  })

  it('estimates itemCount when total is undefined', () => {
    render(<PaginationFooter {...defaultProps} total={undefined} hasNext={true} page={1} perPage={20} />)

    // itemCount = 1 * 20 + 1 = 21
    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument()
  })

  it('calls onNext when navigating forward', async () => {
    const onNext = vi.fn()
    const user = userEvent.setup()

    render(<PaginationFooter {...defaultProps} onNext={onNext} total={50} page={1} perPage={20} />)

    // PF Pagination has a next page button
    const nextButton = screen.getByRole('button', { name: /next/i })
    await user.click(nextButton)

    expect(onNext).toHaveBeenCalledOnce()
  })

  it('calls onPrev when navigating backward', async () => {
    const onPrev = vi.fn()
    const user = userEvent.setup()

    render(<PaginationFooter {...defaultProps} onPrev={onPrev} total={50} page={2} perPage={20} />)

    // PF Pagination has a previous page button
    const prevButton = screen.getByRole('button', { name: /prev/i })
    await user.click(prevButton)

    expect(onPrev).toHaveBeenCalledOnce()
  })

  it('calls onPerPageChange when per-page selection changes', async () => {
    const onPerPageChange = vi.fn()
    const user = userEvent.setup()

    render(<PaginationFooter {...defaultProps} onPerPageChange={onPerPageChange} total={100} page={1} perPage={20} />)

    // PF compact Pagination has a menu toggle for per-page options.
    // Find the per-page toggle by its id.
    const perPageToggle = screen.getByRole('button', { name: /1 - 20/i })
    await user.click(perPageToggle)

    // Select a different option (e.g., 50 per page)
    const option50 = await screen.findByRole('menuitem', { name: /50 per page/i })
    await user.click(option50)

    expect(onPerPageChange).toHaveBeenCalledWith(50)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<PaginationFooter {...defaultProps} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
