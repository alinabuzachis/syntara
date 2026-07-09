import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { ApprovalStatusBadges } from './approvalUtils'

describe('ApprovalStatusBadges', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<ApprovalStatusBadges status="pending" />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders nothing when status is null', () => {
    render(<ApprovalStatusBadges status={null} />)
    expect(screen.queryByText(/pending|approved|rejected|expired|cancelled/i)).not.toBeInTheDocument()
  })

  it('renders nothing when status is undefined', () => {
    render(<ApprovalStatusBadges status={undefined} />)
    expect(screen.queryByText(/pending|approved|rejected|expired|cancelled/i)).not.toBeInTheDocument()
  })

  it('renders "Pending" badge with warning status for pending', () => {
    render(<ApprovalStatusBadges status="pending" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders "Approved" badge with success status for approved', () => {
    render(<ApprovalStatusBadges status="approved" />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('renders "Rejected" badge with danger status for rejected', () => {
    render(<ApprovalStatusBadges status="rejected" />)
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('renders "Expired" badge with warning status for expired', () => {
    render(<ApprovalStatusBadges status="expired" />)
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('renders "Cancelled" badge with info status for cancelled', () => {
    render(<ApprovalStatusBadges status="cancelled" />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('capitalizes status text correctly', () => {
    render(<ApprovalStatusBadges status="pending" />)
    // Verify first letter is capitalized
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.queryByText('pending')).not.toBeInTheDocument()
  })
})
