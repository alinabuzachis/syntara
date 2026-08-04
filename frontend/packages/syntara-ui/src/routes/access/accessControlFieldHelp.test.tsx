import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { accessControlHelp } from './accessControlFieldHelp'
import { POLICIES_HELP, PRINCIPAL_TYPE_HELP, ROLE_HELP, SCOPE_HELP } from './accessControlFieldHelpText'

describe('accessControlHelp', () => {
  it('exposes prebuilt diagnostic help elements', async () => {
    const user = userEvent.setup()
    render(
      <>
        {accessControlHelp.resourceType}
        {accessControlHelp.action}
        {accessControlHelp.project}
        {accessControlHelp.resourceId}
      </>
    )

    expect(screen.getByRole('button', { name: 'More info for Resource type' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More info for Action' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More info for Project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More info for Resource ID' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More info for Action' }))
    expect(screen.getByText('Action')).toBeInTheDocument()
  })

  it('exposes prebuilt role and assignment help elements', async () => {
    const user = userEvent.setup()
    render(
      <>
        {accessControlHelp.scope}
        {accessControlHelp.policies}
        {accessControlHelp.principalType}
        {accessControlHelp.role}
      </>
    )

    await user.click(screen.getByRole('button', { name: 'More info for Scope' }))
    expect(screen.getByText(SCOPE_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Policies' }))
    expect(screen.getByText(POLICIES_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Principal type' }))
    expect(screen.getByText(PRINCIPAL_TYPE_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Role' }))
    expect(screen.getByText(ROLE_HELP)).toBeInTheDocument()
  })
})
