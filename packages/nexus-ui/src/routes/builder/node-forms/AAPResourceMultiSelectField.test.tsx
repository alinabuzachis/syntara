import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { AAPFormData } from './aapFormSchema'
import { AAPResourceMultiSelectField } from './AAPResourceMultiSelectField'

function TestWrapper({ children, defaultValues }: { children: React.ReactNode; defaultValues?: Partial<AAPFormData> }) {
  const methods = useForm<AAPFormData>({
    defaultValues: {
      name: '',
      organization: '',
      jobTemplateName: '',
      credentials: [],
      ...defaultValues,
    },
  })
  return <FormProvider {...methods}>{children}</FormProvider>
}

const mockItems = [
  { id: 1, name: 'Machine Credential' },
  { id: 2, name: 'AWS Credential' },
  { id: 3, name: 'Azure Credential' },
]

describe('AAPResourceMultiSelectField', () => {
  it('renders with placeholder text when no items selected', () => {
    render(
      <TestWrapper>
        <AAPResourceMultiSelectField
          label="Credentials"
          fieldId="test-credentials"
          nameField="credentials"
          items={mockItems}
          isLoading={false}
          helperText="Select credentials"
          placeholderText="Use default credentials"
        />
      </TestWrapper>
    )

    expect(screen.getByRole('button', { name: /Use default credentials/i })).toBeInTheDocument()
    expect(screen.getByText(/Select credentials/i)).toBeInTheDocument()
  })

  it('shows badge with count when items are selected', () => {
    render(
      <TestWrapper defaultValues={{ credentials: [1, 2] }}>
        <AAPResourceMultiSelectField
          label="Credentials"
          fieldId="test-credentials"
          nameField="credentials"
          items={mockItems}
          isLoading={false}
          helperText="Select credentials"
          placeholderText="Use default credentials"
        />
      </TestWrapper>
    )

    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // Badge count
  })

  it('opens menu and displays items when clicked', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <AAPResourceMultiSelectField
          label="Credentials"
          fieldId="test-credentials"
          nameField="credentials"
          items={mockItems}
          isLoading={false}
          helperText="Select credentials"
          placeholderText="Use default credentials"
        />
      </TestWrapper>
    )

    const toggle = screen.getByRole('button', { name: /Use default credentials/i })
    await user.click(toggle)

    await waitFor(() => {
      expect(screen.getByText('Machine Credential')).toBeInTheDocument()
      expect(screen.getByText('AWS Credential')).toBeInTheDocument()
      expect(screen.getByText('Azure Credential')).toBeInTheDocument()
    })
  })

  it('selects and deselects items', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <AAPResourceMultiSelectField
          label="Credentials"
          fieldId="test-credentials"
          nameField="credentials"
          items={mockItems}
          isLoading={false}
          helperText="Select credentials"
          placeholderText="Use default credentials"
        />
      </TestWrapper>
    )

    // Open menu
    const toggle = screen.getByRole('button', { name: /Use default credentials/i })
    await user.click(toggle)

    // Select first item
    const machineOption = await screen.findByText('Machine Credential')
    await user.click(machineOption)

    // Verify badge shows 1 selected
    await waitFor(() => {
      expect(screen.getByText('1 selected')).toBeInTheDocument()
    })

    // Select second item
    const awsOption = screen.getByText('AWS Credential')
    await user.click(awsOption)

    // Verify badge shows 2 selected
    await waitFor(() => {
      expect(screen.getByText('2 selected')).toBeInTheDocument()
    })

    // Deselect first item
    await user.click(machineOption)

    // Verify badge shows 1 selected
    await waitFor(() => {
      expect(screen.getByText('1 selected')).toBeInTheDocument()
    })
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <TestWrapper>
        <AAPResourceMultiSelectField
          label="Credentials"
          fieldId="test-credentials"
          nameField="credentials"
          items={mockItems}
          isLoading={false}
          helperText="Select credentials"
          placeholderText="Use default credentials"
        />
      </TestWrapper>
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('shows loading spinner when isLoading is true', () => {
    render(
      <TestWrapper>
        <AAPResourceMultiSelectField
          label="Credentials"
          fieldId="test-credentials"
          nameField="credentials"
          items={[]}
          isLoading={true}
          helperText="Select credentials"
          placeholderText="Use default credentials"
        />
      </TestWrapper>
    )

    expect(screen.getByRole('button', { name: /Use default credentials/i })).toBeDisabled()
  })

  it('shows "No items available" when items array is empty and not loading', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <AAPResourceMultiSelectField
          label="Credentials"
          fieldId="test-credentials"
          nameField="credentials"
          items={[]}
          isLoading={false}
          helperText="Select credentials"
          placeholderText="Use default credentials"
        />
      </TestWrapper>
    )

    const toggle = screen.getByRole('button', { name: /Use default credentials/i })
    await user.click(toggle)

    await waitFor(() => {
      expect(screen.getByText('No items available')).toBeInTheDocument()
    })
  })

  it('calls onSearchChange when search input changes', async () => {
    const onSearchChange = vi.fn()
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <AAPResourceMultiSelectField
          label="Credentials"
          fieldId="test-credentials"
          nameField="credentials"
          items={mockItems}
          isLoading={false}
          helperText="Select credentials"
          placeholderText="Use default credentials"
          onSearchChange={onSearchChange}
        />
      </TestWrapper>
    )

    // Open menu
    const toggle = screen.getByRole('button', { name: /Use default credentials/i })
    await user.click(toggle)

    // Find search input and type
    const searchInput = screen.getByPlaceholderText('Search')
    await user.type(searchInput, 'machine')

    // Verify debounced search callback was called
    await waitFor(
      () => {
        expect(onSearchChange).toHaveBeenCalledWith('machine')
      },
      { timeout: 500 }
    )
  })

  it('renders search input when onSearchChange is provided', async () => {
    const onSearchChange = vi.fn()
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <AAPResourceMultiSelectField
          label="Credentials"
          fieldId="test-credentials"
          nameField="credentials"
          items={mockItems}
          isLoading={false}
          helperText="Select credentials"
          placeholderText="Use default credentials"
          onSearchChange={onSearchChange}
        />
      </TestWrapper>
    )

    // Open menu
    const toggle = screen.getByRole('button', { name: /Use default credentials/i })
    await user.click(toggle)

    // Verify search input is rendered
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search')).toBeInTheDocument()
    })
  })
})
