import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { APP_TITLE } from '../../../../utils/appTitle'

import { GroupMappingTableHead } from './groupMappingTableHead'
import { GROUP_HELP, IDP_GROUP_VALUE_HELP } from './idpFieldHelpText'

describe('GroupMappingTableHead', () => {
  const defaultProps = {
    showActionsColumn: false,
    showWildcardHelp: false,
  }

  it('renders column headers with field help', () => {
    render(
      <table>
        <GroupMappingTableHead {...defaultProps} />
      </table>
    )

    expect(screen.getByText('IdP group value')).toBeInTheDocument()
    expect(screen.getByText(`${APP_TITLE} group`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More info for IdP group value' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More info for Group' })).toBeInTheDocument()
  })

  it('does not render Actions column header when showActionsColumn is false', () => {
    render(
      <table>
        <GroupMappingTableHead {...defaultProps} />
      </table>
    )

    expect(screen.queryByText('Actions')).not.toBeInTheDocument()
  })

  it('renders Actions column header when showActionsColumn is true', () => {
    render(
      <table>
        <GroupMappingTableHead {...defaultProps} showActionsColumn />
      </table>
    )

    // Actions column uses screenReaderText prop, so it's present but visually hidden
    const header = screen.getByRole('columnheader', { name: 'Actions' })
    expect(header).toBeInTheDocument()
  })

  it('does not render wildcard help icon when showWildcardHelp is false', () => {
    render(
      <table>
        <GroupMappingTableHead {...defaultProps} />
      </table>
    )

    expect(screen.queryByRole('button', { name: /wildcard patterns help/i })).not.toBeInTheDocument()
  })

  it('renders wildcard help icon when showWildcardHelp is true', () => {
    render(
      <table>
        <GroupMappingTableHead {...defaultProps} showWildcardHelp />
      </table>
    )

    expect(screen.getByRole('button', { name: 'Wildcard patterns help' })).toBeInTheDocument()
  })

  it('field help popovers show IdP group value and Group copy', async () => {
    const user = userEvent.setup()
    render(
      <table>
        <GroupMappingTableHead {...defaultProps} />
      </table>
    )

    await user.click(screen.getByRole('button', { name: 'More info for IdP group value' }))
    expect(screen.getByText(IDP_GROUP_VALUE_HELP)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More info for Group' }))
    expect(screen.getByText(GROUP_HELP)).toBeInTheDocument()
  })

  it('wildcard help popover shows title, intro, and all pattern examples (single open)', async () => {
    const user = userEvent.setup()
    render(
      <table>
        <GroupMappingTableHead {...defaultProps} showWildcardHelp />
      </table>
    )

    await user.click(screen.getByRole('button', { name: 'Wildcard patterns help' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Wildcard patterns')).toBeInTheDocument()
    expect(screen.getByText(/Use wildcards to match multiple IdP groups/i)).toBeInTheDocument()

    const examplePatterns = [
      /matches everything \(e\.g\. assign all users\)/,
      /matches admin-prod, admin-staging/,
      /matches org1\/engineers, org2\/engineers/,
      /matches a single character/,
    ] as const

    for (const pattern of examplePatterns) {
      expect(screen.getByText(pattern)).toBeInTheDocument()
    }
  })

  it('help icon button is inline with header text', () => {
    render(
      <table>
        <GroupMappingTableHead {...defaultProps} showWildcardHelp />
      </table>
    )

    const helpButton = screen.getByRole('button', { name: 'Wildcard patterns help' })
    // Check that isInline prop is applied (results in specific style)
    expect(helpButton).toHaveStyle({ verticalAlign: 'middle' })
  })

  it('has no accessibility violations without wildcard help', async () => {
    const { container } = render(
      <table>
        <GroupMappingTableHead {...defaultProps} />
      </table>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with wildcard help', async () => {
    const { container } = render(
      <table>
        <GroupMappingTableHead {...defaultProps} showWildcardHelp />
      </table>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with actions column', async () => {
    const { container } = render(
      <table>
        <GroupMappingTableHead {...defaultProps} showActionsColumn />
      </table>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with all features enabled', async () => {
    const { container } = render(
      <table>
        <GroupMappingTableHead showActionsColumn showWildcardHelp />
      </table>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with popover open', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <table>
        <GroupMappingTableHead {...defaultProps} showWildcardHelp />
      </table>
    )

    await user.click(screen.getByRole('button', { name: 'Wildcard patterns help' }))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
