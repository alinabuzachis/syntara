import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Credential } from './credentialConstants'
import { GroupedCredentialsTableBody } from './CredentialsTableBody'

vi.mock('../../../components/table/LinkCell', () => ({
  LinkCell: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

const sampleCredential: Credential = {
  id: 'cred-1',
  name: 'GitHub Token',
  enabled: true,
  credential_type_id: 'type-1',
} as Credential

describe('GroupedCredentialsTableBody', () => {
  const getRowActions = vi.fn(() => [])
  const onToggleEnabled = vi.fn()

  it('renders project group header with credential rows', () => {
    const grouped = new Map([
      ['proj-1', { project: { id: 'proj-1', name: 'Project Alpha' } as never, credentials: [sampleCredential] }],
    ])

    render(
      <table>
        <GroupedCredentialsTableBody
          groupedCredentials={grouped}
          collapsedProjects={new Set()}
          onToggleProject={vi.fn()}
          typeMap={new Map([['type-1', { id: 'type-1', name: 'GitHub' } as never]])}
          expandedRows={new Set()}
          onToggleRow={vi.fn()}
          getRowActions={getRowActions}
          onToggleEnabled={onToggleEnabled}
        />
      </table>
    )

    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('GitHub Token')).toBeInTheDocument()
  })

  it('renders "No project" header for unknown project id', () => {
    const grouped = new Map([['unknown', { project: null, credentials: [sampleCredential] }]])

    render(
      <table>
        <GroupedCredentialsTableBody
          groupedCredentials={grouped}
          collapsedProjects={new Set()}
          onToggleProject={vi.fn()}
          typeMap={new Map([['type-1', { id: 'type-1', name: 'GitHub' } as never]])}
          expandedRows={new Set()}
          onToggleRow={vi.fn()}
          getRowActions={getRowActions}
          onToggleEnabled={onToggleEnabled}
        />
      </table>
    )

    expect(screen.getByText('No project')).toBeInTheDocument()
    expect(screen.getByText('GitHub Token')).toBeInTheDocument()
  })

  it('hides credential rows when project group is collapsed', async () => {
    const user = userEvent.setup()
    const onToggleProject = vi.fn()
    const grouped = new Map([
      ['proj-1', { project: { id: 'proj-1', name: 'Project Alpha' } as never, credentials: [sampleCredential] }],
    ])

    render(
      <table>
        <GroupedCredentialsTableBody
          groupedCredentials={grouped}
          collapsedProjects={new Set(['proj-1'])}
          onToggleProject={onToggleProject}
          typeMap={new Map()}
          expandedRows={new Set()}
          onToggleRow={vi.fn()}
          getRowActions={getRowActions}
          onToggleEnabled={onToggleEnabled}
        />
      </table>
    )

    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.queryByText('GitHub Token')).not.toBeInTheDocument()

    await user.click(screen.getByText('Project Alpha'))
    expect(onToggleProject).toHaveBeenCalledWith('proj-1')
  })
})
