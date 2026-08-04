import type { IntegrationsAPI } from '@syntara/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { CredentialIntegrationWarning } from './CredentialIntegrationWarning'

type Integration = IntegrationsAPI.components['schemas']['IntegrationRead']

const mockIntegrations = [
  { id: 'int-1', name: 'GitHub Copilot' },
  { id: 'int-2', name: 'Jira Integration' },
] as Partial<Integration>[] as Integration[]

describe('CredentialIntegrationWarning', () => {
  it('has no accessibility violations with integrations', async () => {
    const { container } = render(
      <CredentialIntegrationWarning
        affectedIntegrations={mockIntegrations}
        integrationsFetchError={false}
        consequenceText="Deleting it will affect these integrations:"
      />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with fetch error', async () => {
    const { container } = render(
      <CredentialIntegrationWarning
        affectedIntegrations={[]}
        integrationsFetchError={true}
        consequenceText="Deleting it will affect these integrations:"
      />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders integration names in list without error alert when no fetch error', () => {
    render(
      <CredentialIntegrationWarning
        affectedIntegrations={mockIntegrations}
        integrationsFetchError={false}
        consequenceText="Deleting it will affect these integrations:"
      />
    )

    expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
    expect(screen.getByText('Jira Integration')).toBeInTheDocument()
    expect(screen.queryByText(/Unable to check/)).not.toBeInTheDocument()
  })

  it('renders badge count', () => {
    render(
      <CredentialIntegrationWarning
        affectedIntegrations={mockIntegrations}
        integrationsFetchError={false}
        consequenceText="Deleting it will affect these integrations:"
      />
    )

    expect(screen.getByText('Integrations')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders consequence text', () => {
    render(
      <CredentialIntegrationWarning
        affectedIntegrations={mockIntegrations}
        integrationsFetchError={false}
        consequenceText="Deleting it will affect these integrations:"
      />
    )

    expect(screen.getByText('Deleting it will affect these integrations:')).toBeInTheDocument()
  })

  it('renders warning alert on fetch error without integration list', () => {
    render(
      <CredentialIntegrationWarning
        affectedIntegrations={[]}
        integrationsFetchError={true}
        consequenceText="Deleting it will affect these integrations:"
      />
    )

    expect(screen.getByText(/Unable to check which integrations use this credential/)).toBeInTheDocument()
    expect(screen.queryByText('Integrations')).not.toBeInTheDocument()
  })

  it('renders both warning alert and integration list when fetch error and integrations present', () => {
    render(
      <CredentialIntegrationWarning
        affectedIntegrations={mockIntegrations}
        integrationsFetchError={true}
        consequenceText="Disabling it will affect these integrations:"
      />
    )

    expect(screen.getByText(/Unable to check which integrations use this credential/)).toBeInTheDocument()
    expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
    expect(screen.getByText('Jira Integration')).toBeInTheDocument()
  })

  it('renders correctly with a single integration', () => {
    const singleIntegration = [{ id: 'int-1', name: 'Solo Integration' }] as Partial<Integration>[] as Integration[]
    render(
      <CredentialIntegrationWarning
        affectedIntegrations={singleIntegration}
        integrationsFetchError={false}
        consequenceText="This will affect the integration:"
      />
    )

    expect(screen.getByText('Solo Integration')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders nothing when no integrations and no error', () => {
    const { container } = render(
      <CredentialIntegrationWarning
        affectedIntegrations={[]}
        integrationsFetchError={false}
        consequenceText="Deleting it will affect these integrations:"
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
