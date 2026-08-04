import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { nodeHelp } from './nodeFieldHelp'

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
