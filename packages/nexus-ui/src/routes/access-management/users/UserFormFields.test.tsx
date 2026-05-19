import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

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
    await user.type(screen.getByLabelText('Password'), 'secret123')

    expect(screen.getByLabelText('Username')).toHaveValue('jdoe')
    expect(screen.getByLabelText('First Name')).toHaveValue('Jane')
    expect(screen.getByLabelText('Last Name')).toHaveValue('Doe')
    expect(screen.getByLabelText('Email')).toHaveValue('jane@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue('secret123')
  })

  it('renders password field with type="password"', () => {
    render(<TestWrapper />)

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<TestWrapper />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
