import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { PROJECT_NAME_HELP, projectHelp } from './projectFieldHelp'

describe('projectHelp', () => {
  it('exposes prebuilt name help element', async () => {
    const user = userEvent.setup()
    render(projectHelp.name)

    await user.click(screen.getByRole('button', { name: 'More info for Project name' }))
    expect(screen.getByText(PROJECT_NAME_HELP)).toBeInTheDocument()
  })
})
