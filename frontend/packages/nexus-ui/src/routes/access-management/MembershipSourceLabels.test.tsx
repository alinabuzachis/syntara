import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { MembershipSourceLabels } from './MembershipSourceLabels'

describe('MembershipSourceLabels', () => {
  it('renders nothing when sources is undefined', () => {
    const { container } = render(<MembershipSourceLabels />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when sources is empty', () => {
    const { container } = render(<MembershipSourceLabels sources={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a Manual label for non-idp source', () => {
    render(<MembershipSourceLabels sources={[{ type: 'manual' }]} />)
    expect(screen.getByText('Manual')).toBeInTheDocument()
  })

  it('renders provider name for idp source', () => {
    render(<MembershipSourceLabels sources={[{ type: 'idp', provider_name: 'Azure AD' }]} />)
    expect(screen.getByText('Azure AD')).toBeInTheDocument()
  })

  it('renders fallback "IdP" when idp source has no provider_name', () => {
    render(<MembershipSourceLabels sources={[{ type: 'idp' }]} />)
    expect(screen.getByText('IdP')).toBeInTheDocument()
  })

  it('renders multiple source labels', () => {
    render(<MembershipSourceLabels sources={[{ type: 'manual' }, { type: 'idp', provider_name: 'Okta' }]} />)
    expect(screen.getByText('Manual')).toBeInTheDocument()
    expect(screen.getByText('Okta')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <MembershipSourceLabels sources={[{ type: 'manual' }, { type: 'idp', provider_name: 'Azure AD' }]} />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
