import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, FormProvider } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import type { UserFormData } from '../userFormSchema'

import { UserFormFields } from './UserFormFields'

const defaultValues: UserFormData = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  role: 'viewer',
  is_active: true,
}

function TestWrapper({ isEdit = false }: { isEdit?: boolean }) {
  const methods = useForm<UserFormData>({
    defaultValues,
  })

  return (
    <FormProvider {...methods}>
      <form>
        <UserFormFields control={methods.control} isEdit={isEdit} />
      </form>
    </FormProvider>
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
    expect(screen.getByLabelText('System Role')).toBeInTheDocument()
    expect(screen.getByLabelText('Active')).toBeInTheDocument()
  })

  it('disables username field in edit mode', () => {
    render(<TestWrapper isEdit />)

    expect(screen.getByLabelText('Username')).toBeDisabled()
  })

  it('enables username field in create mode', () => {
    render(<TestWrapper isEdit={false} />)

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

  it('renders all role options in the dropdown', () => {
    render(<TestWrapper />)

    expect(screen.getByRole('option', { name: 'Viewer' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Creator' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Approver' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Administrator' })).toBeInTheDocument()
  })

  it('shows "Active" label on the status switch by default', () => {
    render(<TestWrapper />)

    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows "Inactive" label when status switch is toggled off', async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    await user.click(screen.getByLabelText('Active'))

    expect(screen.getByText('Inactive')).toBeInTheDocument()
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
