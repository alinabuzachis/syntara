import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { integrationHelp } from './integrationFieldHelp'
import {
  AAP_URL_HELP,
  API_URL_HELP,
  HEALTH_CHECK_CREDENTIAL_HELP,
  INTEGRATION_TYPE_HELP,
  NAME_HELP,
  PROJECTS_HELP,
  PROVIDER_TYPE_HELP,
  SCOPE_HELP,
} from './integrationFieldHelpText'

describe('integrationHelp', () => {
  it('exposes prebuilt help elements for each integration form field', async () => {
    const user = userEvent.setup()
    render(
      <>
        {integrationHelp.integrationType}
        {integrationHelp.name}
        {integrationHelp.serverName}
        {integrationHelp.providerType}
        {integrationHelp.apiUrl}
        {integrationHelp.aapUrl}
        {integrationHelp.scope}
        {integrationHelp.projects}
        {integrationHelp.healthCheckCredential}
      </>
    )

    await user.click(screen.getByRole('button', { name: 'More info for Integration type' }))
    expect(screen.getByText(INTEGRATION_TYPE_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Name' }))
    expect(screen.getAllByText(NAME_HELP).length).toBeGreaterThan(0)

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Server name / ID' }))
    expect(screen.getAllByText(NAME_HELP).length).toBeGreaterThan(0)

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Provider type' }))
    expect(screen.getByText(PROVIDER_TYPE_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getAllByRole('button', { name: 'More info for API URL' })[0])
    expect(screen.getByText(API_URL_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getAllByRole('button', { name: 'More info for API URL' })[1])
    expect(screen.getByText(AAP_URL_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Scope' }))
    expect(screen.getByText(SCOPE_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Projects' }))
    expect(screen.getByText(PROJECTS_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Health check credential' }))
    expect(screen.getByText(HEALTH_CHECK_CREDENTIAL_HELP)).toBeInTheDocument()
  })
})
