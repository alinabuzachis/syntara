import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { dynamicFetchClient } from './accessClient'
import { ResourceIdSelect } from './ResourceIdSelect'

// Helper to build mock FetchResponse objects without fighting openapi-fetch internal types
function mockFetchResponse(data: unknown, error?: unknown) {
  return { data, error, response: new Response() } as never
}

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
  interfaceTagMiddleware: { onRequest: vi.fn() },
}))

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  accessFetchClient: {
    GET: vi.fn(),
  },
  dynamicFetchClient: {
    GET: vi.fn(),
  },
}))

const mockWorkflows = [
  { id: 'wf-1', name: 'Deploy Pipeline' },
  { id: 'wf-2', name: 'Build Pipeline' },
]

function renderResourceIdSelect(overrides: Partial<React.ComponentProps<typeof ResourceIdSelect>> = {}) {
  const props = {
    resourceType: 'workflow',
    value: '',
    onChange: vi.fn(),
    ...overrides,
  }
  const view = render(<ResourceIdSelect {...props} />)
  return { ...view, onChange: props.onChange }
}

/**
 * Waits for the async useResourceOptions effect to settle.
 * The hook calls accessFetchClient.GET().then(setOptions) which updates
 * state outside React's batch context.
 */
async function waitForFetch() {
  // Flush all pending microtasks and timers to let the fetch + setState settle
  await act(async () => {
    // Allow the Promise.then(setOptions) to fire
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })
}

describe('ResourceIdSelect', () => {
  beforeEach(() => {
    vi.mocked(dynamicFetchClient.GET).mockResolvedValue(mockFetchResponse({ resources: mockWorkflows }))
  })

  describe('Accessibility', () => {
    it('has no accessibility violations when rendering a plain text input', async () => {
      // A resource type without an endpoint falls back to TextInput (no async fetch)
      const { container } = renderResourceIdSelect({ resourceType: 'unknown-type' })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations when rendering select dropdown', async () => {
      const { container } = renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()
      // Disable nested-interactive: PF6 MenuToggle wraps an interactive TextInput
      // inside a button, which is a known upstream PatternFly issue.
      const results = await axe(container, { rules: { 'nested-interactive': { enabled: false } } })
      expect(results).toHaveNoViolations()
    })
  })

  describe('Plain TextInput fallback', () => {
    it('renders a TextInput for resource types without an endpoint', () => {
      renderResourceIdSelect({ resourceType: 'unknown-type' })
      expect(screen.getByRole('textbox', { name: 'Resource ID' })).toBeInTheDocument()
    })

    it('shows placeholder for plain text input', () => {
      renderResourceIdSelect({ resourceType: 'unknown-type' })
      expect(screen.getByPlaceholderText('Enter resource ID')).toBeInTheDocument()
    })

    it('calls onChange when text is typed', async () => {
      const user = userEvent.setup()
      const { onChange } = renderResourceIdSelect({ resourceType: 'unknown-type' })

      await user.type(screen.getByRole('textbox', { name: 'Resource ID' }), 'my-id')

      expect(onChange).toHaveBeenCalled()
    })

    it('displays the current value', () => {
      renderResourceIdSelect({ resourceType: 'unknown-type', value: 'existing-id' })
      expect(screen.getByRole('textbox', { name: 'Resource ID' })).toHaveValue('existing-id')
    })
  })

  describe('Select dropdown for known resource types', () => {
    it('renders a select toggle for resource types with an endpoint', async () => {
      renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()
      expect(screen.queryByRole('textbox', { name: 'Resource ID' })).not.toBeInTheDocument()
    })

    it('shows placeholder with resource type name', async () => {
      renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()
      expect(screen.getByPlaceholderText(/search workflow/i)).toBeInTheDocument()
    })

    it('fetches resources from the API', async () => {
      renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()
      expect(dynamicFetchClient.GET).toHaveBeenCalledWith('/workflows', {})
    })

    it('displays fetched options when dropdown is opened', async () => {
      const user = userEvent.setup()
      renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      await user.click(input)

      expect(screen.getByRole('option', { name: /Deploy Pipeline/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Build Pipeline/i })).toBeInTheDocument()
    })

    it('calls onChange when an option is selected', async () => {
      const user = userEvent.setup()
      const { onChange } = renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      await user.click(input)
      await user.click(screen.getByRole('option', { name: /Deploy Pipeline/i }))

      expect(onChange).toHaveBeenCalledWith('wf-1')
    })

    it('shows None option to clear selection when a value is set', async () => {
      const user = userEvent.setup()
      renderResourceIdSelect({ resourceType: 'workflow', value: 'wf-1' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      await user.click(input)

      expect(screen.getByText(/None/)).toBeInTheDocument()
    })

    it('calls onChange with empty string when None is selected', async () => {
      const user = userEvent.setup()
      const { onChange } = renderResourceIdSelect({ resourceType: 'workflow', value: 'wf-1' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      await user.click(input)
      await user.click(screen.getByRole('option', { name: /None/i }))

      expect(onChange).toHaveBeenCalledWith('')
    })
  })

  describe('Error handling', () => {
    it('shows no items when API call fails', async () => {
      vi.mocked(dynamicFetchClient.GET).mockRejectedValue(new Error('Network error'))

      const user = userEvent.setup()
      renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      await user.click(input)

      expect(screen.getByText(/No workflows found/i)).toBeInTheDocument()
    })

    it('shows no items when API returns an error response', async () => {
      vi.mocked(dynamicFetchClient.GET).mockResolvedValue(mockFetchResponse(undefined, { detail: 'Unauthorized' }))

      const user = userEvent.setup()
      renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      await user.click(input)

      expect(screen.getByText(/No workflows found/i)).toBeInTheDocument()
    })
  })

  describe('Filtering', () => {
    it('filters options by label text', async () => {
      const user = userEvent.setup()
      renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      await user.click(input)
      await user.type(input, 'Deploy')

      expect(screen.getByRole('option', { name: /Deploy Pipeline/i })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /Build Pipeline/i })).not.toBeInTheDocument()
    })

    it('shows no matches when filter does not match any option', async () => {
      const user = userEvent.setup()
      renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      await user.click(input)
      await user.type(input, 'zzzzz')

      expect(screen.getByText('No matches')).toBeInTheDocument()
    })

    it('clears filter when dropdown is closed', async () => {
      const user = userEvent.setup()
      renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      await user.click(input)
      await user.type(input, 'Deploy')
      expect(screen.queryByRole('option', { name: /Build Pipeline/i })).not.toBeInTheDocument()

      await user.keyboard('{Escape}')

      await user.click(input)
      expect(screen.getByRole('option', { name: /Deploy Pipeline/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Build Pipeline/i })).toBeInTheDocument()
    })
  })

  describe('Display value', () => {
    it('displays the label of the selected resource', async () => {
      renderResourceIdSelect({ resourceType: 'workflow', value: 'wf-1' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      expect(input).toHaveValue('Deploy Pipeline')
    })

    it('displays the raw value if no matching option is found', async () => {
      renderResourceIdSelect({ resourceType: 'workflow', value: 'unknown-id' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      expect(input).toHaveValue('unknown-id')
    })
  })

  describe('Different resource types', () => {
    it('renders select for project resource type', async () => {
      renderResourceIdSelect({ resourceType: 'project' })
      await waitForFetch()
      expect(screen.getByPlaceholderText(/search project/i)).toBeInTheDocument()
    })

    it('renders select for user resource type', async () => {
      renderResourceIdSelect({ resourceType: 'user' })
      await waitForFetch()
      expect(screen.getByPlaceholderText(/search user/i)).toBeInTheDocument()
    })

    it('renders plain input for resource type without endpoint', () => {
      renderResourceIdSelect({ resourceType: 'custom-thing' })
      expect(screen.getByRole('textbox', { name: 'Resource ID' })).toBeInTheDocument()
    })
  })

  describe('Array response format', () => {
    it('handles API response that is a plain array instead of paginated', async () => {
      vi.mocked(dynamicFetchClient.GET).mockResolvedValue(
        mockFetchResponse([
          { id: 'item-1', name: 'Item One' },
          { id: 'item-2', name: 'Item Two' },
        ])
      )

      const user = userEvent.setup()
      renderResourceIdSelect({ resourceType: 'workflow' })
      await waitForFetch()

      const input = screen.getByRole('textbox', { name: /type to filter/i })
      await user.click(input)

      expect(screen.getByRole('option', { name: /Item One/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Item Two/i })).toBeInTheDocument()
    })
  })
})
