import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { PASSWORD_CHARACTER_CLASSES_MESSAGE, PASSWORD_MIN_LENGTH_MESSAGE } from '../passwordComplexity'
import { COMPLIANT_TEST_PASSWORD } from '../passwordComplexity.testFixtures'
import type { UserFormData } from '../userFormSchema'

import { UserFormFields } from './UserFormFields'

vi.mock('../../access/useAllGroups', () => ({
  useAllGroups: () => ({
    groups: [
      { id: 'g1', name: 'users', description: 'Default user group' },
      { id: 'g2', name: 'admins', description: 'Administrator group' },
      { id: 'g3', name: 'auditors', description: 'Auditor group' },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

const defaultValues: UserFormData = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  is_enabled: true,
  group_names: ['users'],
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function QueryWrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function TestWrapper({ isEdit = false }: { isEdit?: boolean }) {
  const methods = useForm<UserFormData>({
    defaultValues,
  })

  return (
    <QueryWrapper>
      <FormProvider {...methods}>
        <form>
          <UserFormFields control={methods.control} isEdit={isEdit} />
        </form>
      </FormProvider>
    </QueryWrapper>
  )
}

function TestWrapperWithPasswordError() {
  const methods = useForm<UserFormData>({
    defaultValues,
  })

  useEffect(() => {
    methods.setError('password', { type: 'custom', message: 'Password is required' })
  }, [methods])

  return (
    <QueryWrapper>
      <FormProvider {...methods}>
        <form>
          <UserFormFields control={methods.control} isEdit={false} />
        </form>
      </FormProvider>
    </QueryWrapper>
  )
}

describe('UserFormFields', () => {
  it('renders all form fields', () => {
    render(<TestWrapper />)

    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('First Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Last Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Enabled')).toBeInTheDocument()
  })

  it('enables username field in edit mode', () => {
    render(<TestWrapper isEdit />)

    expect(screen.getByLabelText('Username')).toBeEnabled()
  })

  it('shows create-mode placeholder for password field', () => {
    render(<TestWrapper isEdit={false} />)

    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument()
  })

  it('shows edit-mode placeholder for password field', () => {
    render(<TestWrapper isEdit />)

    expect(screen.getByPlaceholderText('Leave blank to keep current password')).toBeInTheDocument()
  })

  it('shows "Enabled" label on the status switch by default', () => {
    render(<TestWrapper />)

    expect(screen.getByText('Enabled')).toBeInTheDocument()
  })

  it('shows "Disabled" label when status switch is toggled off', async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    await user.click(screen.getByLabelText('Enabled'))

    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('allows typing into text fields', async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    await user.type(screen.getByLabelText('Username'), 'jdoe')
    await user.type(screen.getByLabelText('First Name'), 'Jane')
    await user.type(screen.getByLabelText('Last Name'), 'Doe')
    await user.type(screen.getByLabelText('Email'), 'jane@example.com')
    await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'secret123')

    expect(screen.getByLabelText('Username')).toHaveValue('jdoe')
    expect(screen.getByLabelText('First Name')).toHaveValue('Jane')
    expect(screen.getByLabelText('Last Name')).toHaveValue('Doe')
    expect(screen.getByLabelText('Email')).toHaveValue('jane@example.com')
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveValue('secret123')
  })

  it('renders password field masked by default', () => {
    render(<TestWrapper />)

    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    await user.click(screen.getByRole('button', { name: 'Show password' }))

    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })

  it('shows password complexity helper text in create mode', () => {
    render(<TestWrapper isEdit={false} />)

    expect(screen.getByText(new RegExp(PASSWORD_MIN_LENGTH_MESSAGE))).toBeInTheDocument()
  })

  it('shows password complexity helper text with both requirements', () => {
    render(<TestWrapper isEdit={false} />)

    expect(screen.getByText(PASSWORD_MIN_LENGTH_MESSAGE)).toBeInTheDocument()
    expect(screen.getByText(PASSWORD_CHARACTER_CLASSES_MESSAGE)).toBeInTheDocument()
  })

  it('accepts compliant password without error', async () => {
    const user = userEvent.setup()
    render(<TestWrapper isEdit={false} />)

    const passwordField = screen.getByLabelText('Password', { selector: 'input' })

    // Type a compliant password
    await user.type(passwordField, COMPLIANT_TEST_PASSWORD)

    // Password field should have the compliant value
    expect(passwordField).toHaveValue(COMPLIANT_TEST_PASSWORD)
  })

  it('hides password complexity helper text when field has error', () => {
    render(<TestWrapperWithPasswordError />)

    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(screen.queryByText(PASSWORD_MIN_LENGTH_MESSAGE)).not.toBeInTheDocument()
    expect(screen.queryByText(PASSWORD_CHARACTER_CLASSES_MESSAGE)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<TestWrapper />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
