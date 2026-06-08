import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

import { ApprovalSummaryList } from './ApprovalSummaryList'

describe('ApprovalSummaryList', () => {
  const defaultProps = {
    workflowName: 'Production Deployment',
    approvalInitiated: 'Jan 15, 2026, 2:30 PM',
    onWorkflowClick: vi.fn(),
  }

  it('renders approval type, workflow name, and initiated time', () => {
    render(<ApprovalSummaryList {...defaultProps} />)

    expect(screen.getByText('Approval type')).toBeInTheDocument()
    expect(screen.getByText('Approval Node')).toBeInTheDocument()
    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.getByText('Production Deployment')).toBeInTheDocument()
    expect(screen.getByText('Approval initiated')).toBeInTheDocument()
    expect(screen.getByText('Jan 15, 2026, 2:30 PM')).toBeInTheDocument()
  })

  it('renders workflow name as link when workflowLink is provided', async () => {
    const user = userEvent.setup()
    const onWorkflowClick = vi.fn()

    render(
      <ApprovalSummaryList
        {...defaultProps}
        workflowLink="/workflow-builder/abc-123"
        onWorkflowClick={onWorkflowClick}
      />
    )

    const link = screen.getByRole('button', { name: 'Production Deployment' })
    expect(link).toBeInTheDocument()

    await user.click(link)
    expect(onWorkflowClick).toHaveBeenCalledWith('/workflow-builder/abc-123')
  })

  it('renders workflow name as plain text when no link provided', () => {
    render(<ApprovalSummaryList {...defaultProps} />)

    expect(screen.queryByRole('button', { name: 'Production Deployment' })).not.toBeInTheDocument()
    expect(screen.getByText('Production Deployment')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ApprovalSummaryList {...defaultProps} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with workflow link', async () => {
    const { container } = render(<ApprovalSummaryList {...defaultProps} workflowLink="/workflow-builder/abc-123" />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
