import { Button } from '@patternfly/react-core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { permissionTooltip } from '../hooks/permissionUtils'

import { DisabledWithTooltip } from './DisabledWithTooltip'

describe('DisabledWithTooltip', () => {
  it('renders children directly when not disabled', () => {
    render(
      <DisabledWithTooltip isDisabled={false} content="You need access">
        <Button>Delete</Button>
      </DisabledWithTooltip>
    )

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('wraps children in a tooltip when disabled', async () => {
    const user = userEvent.setup()

    render(
      <DisabledWithTooltip isDisabled content="You need workflow:delete permission">
        <Button isAriaDisabled>Delete</Button>
      </DisabledWithTooltip>
    )

    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toBeInTheDocument()

    await user.hover(button)

    expect(await screen.findByText('You need workflow:delete permission')).toBeInTheDocument()
  })

  it('has no accessibility violations when not disabled', async () => {
    const { container } = render(
      <DisabledWithTooltip isDisabled={false} content="tooltip text">
        <Button>Action</Button>
      </DisabledWithTooltip>
    )

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations when disabled', async () => {
    const { container } = render(
      <DisabledWithTooltip isDisabled content="tooltip text">
        <Button isAriaDisabled>Action</Button>
      </DisabledWithTooltip>
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('permissionTooltip', () => {
  it('formats the standard permission tooltip message', () => {
    const result = permissionTooltip('delete this workflow', 'workflow:delete')
    expect(result).toBe(
      'To delete this workflow, you need a role with the workflow:delete policy. Contact your Admin to request access.'
    )
  })

  it('handles different action and policy combinations', () => {
    const result = permissionTooltip('create a credential', 'credential:create')
    expect(result).toBe(
      'To create a credential, you need a role with the credential:create policy. Contact your Admin to request access.'
    )
  })
})
