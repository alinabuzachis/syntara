import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { groupHelp } from './groupFieldHelp'
import { GROUP_NAME_HELP } from './groupFieldHelpText'

describe('groupHelp', () => {
  it('exposes prebuilt name help element', async () => {
    const user = userEvent.setup()
    render(groupHelp.name)

    await user.click(screen.getByRole('button', { name: 'More info for Group name' }))
    expect(screen.getByText(GROUP_NAME_HELP)).toBeInTheDocument()
  })
})
