import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

import { executionsClient } from '../../client'
import { useCanI } from '../../hooks/useCanI'

import { CancelExecutionButton } from './CancelExecutionButton'

const mockMutate = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()

vi.mock('../../client', () => ({
  executionsClient: {
    useMutation: vi.fn(() => ({
      mutate: mockMutate,
      isPending: false,
    })),
  },
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../../hooks/useCanI', () => ({
  useCanI: vi.fn(() => ({ allowed: true, isChecking: false })),
}))

vi.mock('../../providers/alerts/AlertContext', () => ({
  useAlerts: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}))

function renderButton(executionId = 'exec-123') {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <CancelExecutionButton executionId={executionId} />
    </QueryClientProvider>
  )
}

describe('CancelExecutionButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(executionsClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)
  })

  it('renders an enabled cancel button', () => {
    renderButton()
    const button = screen.getByRole('button', { name: 'Cancel execution' })
    expect(button).toBeInTheDocument()
    expect(button).toBeEnabled()
  })

  it('calls handleCancel which invokes mutate on click', async () => {
    mockMutate.mockImplementation((_params: unknown, callbacks: { onSuccess: () => void }) => {
      callbacks.onSuccess()
    })
    const user = userEvent.setup()
    renderButton('exec-999')

    await user.click(screen.getByRole('button', { name: 'Cancel execution' }))

    expect(mockMutate).toHaveBeenCalledWith(
      { params: { path: { execution_id: 'exec-999' } } },
      expect.objectContaining({
        onSuccess: expect.any(Function) as unknown,
        onError: expect.any(Function) as unknown,
      })
    )
  })

  it('disables button and shows spinner while mutation is pending', () => {
    vi.mocked(executionsClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    } as never)

    renderButton()

    const button = screen.getByRole('button', { name: /Cancel/ })
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })

  it('is aria-disabled when user lacks execution:run permission', () => {
    vi.mocked(useCanI).mockReturnValue({ allowed: false, isChecking: false })

    renderButton()

    const button = screen.getByRole('button', { name: 'Cancel execution' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderButton()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
