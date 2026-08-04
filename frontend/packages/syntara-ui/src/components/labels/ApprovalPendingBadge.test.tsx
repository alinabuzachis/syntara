import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { axe } from 'vitest-axe'

import { ApprovalPendingBadge } from './ApprovalPendingBadge'

describe('ApprovalPendingBadge', () => {
  it('renders badge when approval_pending is true', () => {
    render(<ApprovalPendingBadge approvalPending={true} />)
    expect(screen.getByText('Pending approval')).toBeInTheDocument()
  })

  it('does not render when approval_pending is false', () => {
    render(<ApprovalPendingBadge approvalPending={false} />)
    expect(screen.queryByText('Pending approval')).not.toBeInTheDocument()
  })

  it('does not render when approval_pending is undefined', () => {
    render(<ApprovalPendingBadge approvalPending={undefined} />)
    expect(screen.queryByText('Pending approval')).not.toBeInTheDocument()
  })

  it('renders with warning status and warning triangle icon', () => {
    render(<ApprovalPendingBadge approvalPending={true} />)

    // Check that the badge is rendered
    expect(screen.getByText('Pending approval')).toBeInTheDocument()

    // Verify the warning triangle icon is present (accessible img role)
    expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ApprovalPendingBadge approvalPending={true} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
