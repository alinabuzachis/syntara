import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, FormProvider } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { IdentityProviderFormFields } from './IdentityProviderFormFields'
import { identityProviderDefaults, type IdentityProviderFormData } from './identityProviderFormSchema'

function TestWrapper({ isEdit = false }: { isEdit?: boolean }) {
  const methods = useForm<IdentityProviderFormData>({
    defaultValues: identityProviderDefaults,
  })

  return (
    <FormProvider {...methods}>
      <form>
        <IdentityProviderFormFields control={methods.control} isEdit={isEdit} />
      </form>
    </FormProvider>
  )
}

describe('IdentityProviderFormFields', () => {
  it('renders provider name field', () => {
    render(<TestWrapper />)

    expect(screen.getByLabelText(/Provider Name/)).toBeInTheDocument()
  })

  it('renders enable provider switch', () => {
    render(<TestWrapper />)

    expect(screen.getByLabelText(/Enabled/)).toBeInTheDocument()
  })

  it('renders auto-discovery switch', () => {
    render(<TestWrapper />)

    expect(screen.getByLabelText(/Use OIDC Discovery/)).toBeInTheDocument()
  })

  it('renders issuer URL field', () => {
    render(<TestWrapper />)

    expect(screen.getByLabelText(/Issuer URL/)).toBeInTheDocument()
  })

  it('renders client ID field', () => {
    render(<TestWrapper />)

    expect(screen.getByLabelText(/Client ID/)).toBeInTheDocument()
  })

  it('renders client secret field as required in add mode', () => {
    render(<TestWrapper />)

    expect(screen.getByLabelText(/Client Secret/)).toBeInTheDocument()
  })

  it('renders redirect URI as read-only clipboard copy', () => {
    render(<TestWrapper />)

    expect(screen.getByText(/Redirect URI/)).toBeInTheDocument()
    expect(screen.getByDisplayValue(/\/api\/v1\/auth\/oidc\/callback/)).toBeInTheDocument()
  })

  it('renders scopes field with default value', () => {
    render(<TestWrapper />)

    expect(screen.getByText('openid')).toBeInTheDocument()
    expect(screen.getByText('profile')).toBeInTheDocument()
    expect(screen.getByText('email')).toBeInTheDocument()
  })

  it('hides manual endpoint fields when auto-discovery is enabled', () => {
    render(<TestWrapper />)

    expect(screen.queryByLabelText(/Authorization Endpoint/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Token Endpoint/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/JWKS URI/)).not.toBeInTheDocument()
  })

  it('shows manual endpoint fields when auto-discovery is toggled off', async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    await user.click(screen.getByLabelText(/Use OIDC Discovery/))

    expect(screen.getByLabelText(/Authorization Endpoint/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Token Endpoint/)).toBeInTheDocument()
    expect(screen.getByLabelText(/JWKS URI/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Userinfo Endpoint/)).toBeInTheDocument()
  })

  it('shows hint text for client secret in edit mode', () => {
    render(<TestWrapper isEdit />)

    expect(screen.getByText(/Leave empty to keep the existing secret/)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<TestWrapper />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
