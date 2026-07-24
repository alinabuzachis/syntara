import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { nodeFieldHelp, nodeHelp } from './nodeFieldHelp'
import { AAP_ORGANIZATION_HELP } from './nodeFieldHelpText'

describe('nodeFieldHelp', () => {
  it('creates a More info popover with the given header and body', async () => {
    const user = userEvent.setup()
    render(nodeFieldHelp('Organization', AAP_ORGANIZATION_HELP))

    await user.click(screen.getByRole('button', { name: 'More info for Organization' }))
    expect(screen.getByText('Organization')).toBeInTheDocument()
    expect(screen.getByText(AAP_ORGANIZATION_HELP)).toBeInTheDocument()
  })
})

describe('nodeHelp', () => {
  it('exposes prebuilt settings and AAP help elements', async () => {
    const user = userEvent.setup()
    render(
      <>
        {nodeHelp.timeout}
        {nodeHelp.aapOrganization}
      </>
    )

    expect(screen.getByRole('button', { name: 'More info for Timeout' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More info for Organization' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More info for Timeout' }))
    expect(screen.getByText('Timeout')).toBeInTheDocument()
  })
})
