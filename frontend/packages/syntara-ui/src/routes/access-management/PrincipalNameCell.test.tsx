import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { PrincipalNameCell } from './PrincipalNameCell'
import { RolePrincipalType } from './RoleAssignmentTypes'

describe('PrincipalNameCell', () => {
  it('links to the principal detail page when principalId is present', () => {
    render(<PrincipalNameCell principalType={RolePrincipalType.USER} principalId="u-1" name="alice" />)

    expect(screen.getByRole('link', { name: 'alice' })).toHaveAttribute(
      'href',
      '/system-administration/access-management/users/u-1'
    )
  })

  it('renders plain text when principalId is empty', () => {
    render(<PrincipalNameCell principalType={RolePrincipalType.GROUP} principalId="" name="orphaned" />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('orphaned')).toBeInTheDocument()
  })

  it('has no accessibility violations when linked', async () => {
    const { container } = render(
      <PrincipalNameCell principalType={RolePrincipalType.USER} principalId="u-1" name="alice" />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
