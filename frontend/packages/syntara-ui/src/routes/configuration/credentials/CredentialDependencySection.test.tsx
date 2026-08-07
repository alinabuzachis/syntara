import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { CredentialDependencySection, NAMED_DEPENDENCY_LIMIT } from './CredentialDependencySection'

describe('CredentialDependencySection', () => {
  it('renders nothing when there are no resources', () => {
    const { container } = render(<CredentialDependencySection label="Workflows" resources={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows label, badge, and names when at or under the named limit', () => {
    const resources = [
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
      { id: '3', name: 'Gamma' },
    ]
    expect(resources.length).toBe(NAMED_DEPENDENCY_LIMIT)

    render(<CredentialDependencySection label="Workflows" resources={resources} />)

    expect(screen.getByText('Workflows')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('shows compact badge summary without names when over the named limit', () => {
    const resources = Array.from({ length: NAMED_DEPENDENCY_LIMIT + 1 }, (_, i) => ({
      id: `id-${i}`,
      name: `Resource ${i}`,
    }))

    render(<CredentialDependencySection label="Integrations" resources={resources} />)

    expect(screen.getByText('Integrations')).toBeInTheDocument()
    expect(screen.getByText(String(resources.length))).toBeInTheDocument()
    expect(screen.queryByText('Resource 0')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('falls back to name as list key when id is missing', () => {
    render(<CredentialDependencySection label="Workflows" resources={[{ name: 'Nameless Id' }]} />)

    expect(screen.getByText('Nameless Id')).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Nameless Id')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <CredentialDependencySection
        label="Workflows"
        resources={[
          { id: '1', name: 'Alpha' },
          { id: '2', name: 'Beta' },
        ]}
      />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
