import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { CredentialWorkflowWarning } from './CredentialWorkflowWarning'

describe('CredentialWorkflowWarning', () => {
  it('renders nothing when no workflows and no error', () => {
    const { container } = render(
      <CredentialWorkflowWarning affectedWorkflows={[]} workflowsFetchError={false} consequenceText="will fail:" />
    )

    expect(container.textContent).toBe('')
  })

  it('shows error warning when workflowsFetchError is true', () => {
    render(<CredentialWorkflowWarning affectedWorkflows={[]} workflowsFetchError={true} consequenceText="will fail:" />)

    expect(screen.getByText(/Unable to check which workflows/)).toBeInTheDocument()
  })

  it('shows workflow list with plural text for multiple workflows', () => {
    const workflows = [
      { id: 'wf-1', name: 'Pipeline A' },
      { id: 'wf-2', name: 'Pipeline B' },
    ]
    render(
      <CredentialWorkflowWarning
        affectedWorkflows={workflows}
        workflowsFetchError={false}
        consequenceText="Deleting it will cause these workflows to fail:"
      />
    )

    expect(screen.getByText('Workflows')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/Deleting it will cause these workflows to fail/)).toBeInTheDocument()
    expect(screen.getByText('Pipeline A')).toBeInTheDocument()
    expect(screen.getByText('Pipeline B')).toBeInTheDocument()
  })

  it('shows singular text for one workflow', () => {
    render(
      <CredentialWorkflowWarning
        affectedWorkflows={[{ id: 'wf-1', name: 'Solo' }]}
        workflowsFetchError={false}
        consequenceText="will fail:"
      />
    )

    expect(screen.getByText('Workflows')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows both error and workflows when both present', () => {
    render(
      <CredentialWorkflowWarning
        affectedWorkflows={[{ id: 'wf-1', name: 'Test WF' }]}
        workflowsFetchError={true}
        consequenceText="will fail:"
      />
    )

    expect(screen.getByText(/Unable to check/)).toBeInTheDocument()
    expect(screen.getByText('Test WF')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const workflows = [
      { id: 'wf-1', name: 'Pipeline A' },
      { id: 'wf-2', name: 'Pipeline B' },
    ]
    const { container } = render(
      <CredentialWorkflowWarning
        affectedWorkflows={workflows}
        workflowsFetchError={false}
        consequenceText="will fail:"
      />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
