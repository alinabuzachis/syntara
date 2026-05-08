import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../providers/alerts'
import { accessClient } from '../../access/accessClient'

import { ProjectPolicySelect } from './ProjectPolicySelect'

vi.mock('../../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockPolicies = [
  { id: 'p1', name: 'read-policy', description: 'Read access' },
  { id: 'p2', name: 'write-policy', description: 'Write access' },
  { id: 'p3', name: 'admin-policy', description: 'Admin access' },
]

describe('ProjectPolicySelect', () => {
  const mockOnChange = vi.fn()

  function setupMocks(
    overrides: {
      policies?: typeof mockPolicies
      isLoading?: boolean
      isFetching?: boolean
    } = {}
  ) {
    const { policies = mockPolicies, isLoading = false, isFetching = false } = overrides
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: { resources: policies },
      isLoading,
      isFetching,
    } as never)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  function renderSelect(selected: string[] = [], hasError = false) {
    return render(
      <ProjectPolicySelect projectId="proj-1" selected={selected} onChange={mockOnChange} hasError={hasError} />,
      { wrapper }
    )
  }

  /** Click the typeahead toggle button to open the dropdown */
  async function openDropdown(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Menu toggle' }))
  }

  it('has no accessibility violations', async () => {
    const { container } = renderSelect()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with selections', async () => {
    const { container } = renderSelect(['read-policy', 'write-policy'])
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders with placeholder when no policies are selected', () => {
    renderSelect()
    expect(screen.getByPlaceholderText('Select policies...')).toBeInTheDocument()
  })

  it('renders selected policies as labels', () => {
    renderSelect(['read-policy', 'write-policy'])

    expect(screen.getByText('read-policy')).toBeInTheDocument()
    expect(screen.getByText('write-policy')).toBeInTheDocument()
  })

  it('does not show placeholder when policies are selected', () => {
    renderSelect(['read-policy'])
    expect(screen.queryByPlaceholderText('Select policies...')).not.toBeInTheDocument()
  })

  it('renders clear all button when policies are selected', () => {
    renderSelect(['read-policy'])
    expect(screen.getByRole('button', { name: 'Clear all selected policies' })).toBeInTheDocument()
  })

  it('does not render clear all button when no policies are selected', () => {
    renderSelect()
    expect(screen.queryByRole('button', { name: 'Clear all selected policies' })).not.toBeInTheDocument()
  })

  it('opens the dropdown and shows policy options when toggle is clicked', async () => {
    const user = userEvent.setup()
    renderSelect()

    await openDropdown(user)

    // PF6 Select with hasCheckbox renders items as menuitems with checkboxes
    expect(screen.getByRole('menuitem', { name: /read-policy/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /write-policy/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /admin-policy/i })).toBeInTheDocument()
  })

  it('calls onChange with added policy when an unselected option is clicked', async () => {
    const user = userEvent.setup()
    renderSelect()

    await openDropdown(user)
    // PF6 Select with hasCheckbox uses checkbox inputs for selection
    await user.click(screen.getByRole('checkbox', { name: /read-policy/i }))

    expect(mockOnChange).toHaveBeenCalledWith(['read-policy'])
  })

  it('calls onChange with removed policy when a selected option is clicked', async () => {
    const user = userEvent.setup()
    renderSelect(['read-policy', 'write-policy'])

    await openDropdown(user)
    // Click the checkbox for the already-selected policy to deselect it
    await user.click(screen.getByRole('checkbox', { name: /read-policy/i }))

    expect(mockOnChange).toHaveBeenCalledWith(['write-policy'])
  })

  it('shows loading state when policies are being fetched', async () => {
    setupMocks({ isLoading: true })
    const user = userEvent.setup()
    renderSelect()

    await openDropdown(user)

    expect(screen.getByText('Loading policies...')).toBeInTheDocument()
  })

  it('shows loading state when policies are being refetched', async () => {
    setupMocks({ isFetching: true })
    const user = userEvent.setup()
    renderSelect()

    await openDropdown(user)

    expect(screen.getByText('Loading policies...')).toBeInTheDocument()
  })

  it('shows empty state when no policies are available', async () => {
    setupMocks({ policies: [] })
    const user = userEvent.setup()
    renderSelect()

    await openDropdown(user)

    expect(screen.getByText('No policies available')).toBeInTheDocument()
  })

  it('filters policy options based on typed input', async () => {
    const user = userEvent.setup()
    renderSelect()

    await openDropdown(user)

    const input = screen.getByRole('textbox', { name: /type to filter/i })
    await user.type(input, 'read')

    expect(screen.getByRole('menuitem', { name: /read-policy/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /write-policy/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /admin-policy/i })).not.toBeInTheDocument()
  })

  it('shows no match message when filter matches nothing', async () => {
    const user = userEvent.setup()
    renderSelect()

    await openDropdown(user)

    const input = screen.getByRole('textbox', { name: /type to filter/i })
    await user.type(input, 'nonexistent')

    expect(screen.getByText('No policies match "nonexistent"')).toBeInTheDocument()
  })

  it('clears all selected policies when clear button is clicked', async () => {
    const user = userEvent.setup()
    renderSelect(['read-policy', 'write-policy'])

    await user.click(screen.getByRole('button', { name: 'Clear all selected policies' }))

    expect(mockOnChange).toHaveBeenCalledWith([])
  })

  it('removes an individual policy when its label close button is clicked', async () => {
    const user = userEvent.setup()
    renderSelect(['read-policy', 'write-policy'])

    // Find the label for read-policy and click its close button
    const readLabel = screen.getByText('read-policy').closest('.pf-v6-c-label')
    expect(readLabel).toBeTruthy()
    const closeButton = within(readLabel as HTMLElement).getByRole('button')
    await user.click(closeButton)

    expect(mockOnChange).toHaveBeenCalledWith(['write-policy'])
  })

  it('includes selected-only policies not present in fetched data', async () => {
    const user = userEvent.setup()
    // 'custom-policy' is selected but not in the fetched mockPolicies
    renderSelect(['custom-policy'])

    // The selected custom-policy should appear as a label
    expect(screen.getByText('custom-policy')).toBeInTheDocument()

    // Open the dropdown - the custom-policy should also appear as an option
    await openDropdown(user)

    expect(screen.getByRole('menuitem', { name: /custom-policy/i })).toBeInTheDocument()
    // Fetched policies should still show
    expect(screen.getByRole('menuitem', { name: /read-policy/i })).toBeInTheDocument()
  })

  it('opens dropdown when typing in the input while closed', async () => {
    const user = userEvent.setup()
    renderSelect()

    // Type directly in the input without clicking the toggle first
    const input = screen.getByPlaceholderText('Select policies...')
    await user.type(input, 'r')

    // The dropdown should have opened and show filtered results
    expect(screen.getByRole('menuitem', { name: /read-policy/i })).toBeInTheDocument()
  })

  it('applies danger status to the toggle when hasError is true', () => {
    renderSelect([], true)

    const toggleButton = screen.getByRole('button', { name: 'Menu toggle' })
    // The danger status class is applied to the parent menu-toggle wrapper
    const menuToggle = toggleButton.closest('.pf-v6-c-menu-toggle')
    expect(menuToggle).toHaveClass('pf-m-danger')
  })

  it('marks selected options as checked in the dropdown', async () => {
    const user = userEvent.setup()
    renderSelect(['read-policy'])

    await openDropdown(user)

    // PF6 renders checkbox inputs for each option
    const selectedCheckbox = screen.getByRole('checkbox', { name: /read-policy/i })
    expect(selectedCheckbox).toBeChecked()

    const unselectedCheckbox = screen.getByRole('checkbox', { name: /write-policy/i })
    expect(unselectedCheckbox).not.toBeChecked()
  })
})
