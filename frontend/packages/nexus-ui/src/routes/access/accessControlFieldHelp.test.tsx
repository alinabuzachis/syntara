import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { accessControlHelp } from './accessControlFieldHelp'

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
})
