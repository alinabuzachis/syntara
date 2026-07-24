import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { FieldHelpPopover } from './FieldHelpPopover'

describe('FieldHelpPopover', () => {
  it('opens popover body when help control is activated', async () => {
    const user = userEvent.setup()
    render(<FieldHelpPopover helpText="Explanation for this field." />)
    await user.click(screen.getByRole('button', { name: 'More info' }))
    expect(screen.getByRole('dialog', { name: 'Field help' })).toBeInTheDocument()
    expect(screen.getByText('Explanation for this field.')).toBeInTheDocument()
  })

  it('uses headerContent in the trigger accessible name', async () => {
    const user = userEvent.setup()
    render(<FieldHelpPopover headerContent="Input schema" helpText="Define an input schema." />)
    await user.click(screen.getByRole('button', { name: 'More info for Input schema' }))
    expect(screen.getByText('Input schema')).toBeInTheDocument()
    expect(screen.getByText('Define an input schema.')).toBeInTheDocument()
  })

  it('supports ReactNode body content', async () => {
    const user = userEvent.setup()
    render(
      <FieldHelpPopover
        helpText={
          <span>
            First sentence. <strong>Important note.</strong>
          </span>
        }
      />
    )
    await user.click(screen.getByRole('button', { name: 'More info' }))
    expect(screen.getByText('Important note.')).toBeInTheDocument()
  })

  it('uses generic More info label when headerContent is not a string', async () => {
    const user = userEvent.setup()
    render(<FieldHelpPopover headerContent={<span>Custom header</span>} helpText="Body copy." />)
    await user.click(screen.getByRole('button', { name: 'More info' }))
    expect(screen.getByText('Custom header')).toBeInTheDocument()
    expect(screen.getByText('Body copy.')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<FieldHelpPopover helpText="Help copy." headerContent="Field" />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
