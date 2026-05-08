import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { ColorSchemeProvider } from '../../../providers/theme/ColorSchemeProvider'

import { TestStepDialog } from './TestStepDialog'

// Mock the workflow API client
const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn(),
}))
vi.mock('../../../client', () => ({
  workflowFetchClient: {
    POST: mockPost,
  },
}))

// Mock Monaco editor since it doesn't work well in test environment
vi.mock('@patternfly/react-code-editor', () => ({
  CodeEditor: ({
    code,
    onCodeChange,
    customControls,
    'aria-label': ariaLabel,
  }: {
    code: string
    onCodeChange: (code: string) => void
    customControls?: React.ReactNode
    'aria-label'?: string
  }) => (
    <div data-testid="code-editor" aria-label={ariaLabel}>
      <textarea
        data-testid="code-textarea"
        value={code}
        onChange={(e) => onCodeChange(e.target.value)}
        aria-label={ariaLabel}
      />
      {customControls}
    </div>
  ),
  CodeEditorControl: ({
    icon,
    onClick,
    'aria-label': ariaLabel,
  }: {
    icon: React.ReactNode
    onClick: () => void
    'aria-label'?: string
  }) => (
    <button data-testid="expand-button" onClick={onClick} aria-label={ariaLabel}>
      {icon}
    </button>
  ),
  Language: {
    json: 'json',
  },
}))

describe('TestStepDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    nodeId: 'activity_1',
    nodeName: 'Test Script',
    workflowId: 'wf_123',
    predecessors: [{ id: 'pred_1', name: 'Previous Step' }],
  }

  const wrapper = ({ children }: { children: React.ReactNode }) => <ColorSchemeProvider>{children}</ColorSchemeProvider>

  beforeEach(() => {
    vi.clearAllMocks()
    // Default successful API response
    mockPost.mockResolvedValue({
      data: { id: 'execution_123' },
      error: null,
    })
  })

  describe('Choice Dialog', () => {
    it('renders choice dialog with node name in title', () => {
      // Arrange
      render(<TestStepDialog {...defaultProps} />, { wrapper })

      // Assert
      expect(screen.getByRole('heading', { name: 'Run Test Script?' })).toBeInTheDocument()
      expect(
        screen.getByText(/You are about to manually run this node\. Do you want to run all the previous nodes/)
      ).toBeInTheDocument()
    })

    it('shows "Run all previous nodes" button as enabled', () => {
      // Arrange
      render(<TestStepDialog {...defaultProps} />, { wrapper })

      // Assert
      const runAllButton = screen.getByRole('button', { name: 'Run all previous nodes' })
      expect(runAllButton).toBeEnabled()
    })

    it('disables "Set mock data" button when no predecessors', () => {
      // Arrange
      render(<TestStepDialog {...defaultProps} predecessors={[]} />, { wrapper })

      // Assert
      expect(screen.getByRole('button', { name: 'Set mock data' })).toBeDisabled()
    })

    it('transitions to mock editor when "Set mock data" is clicked', async () => {
      // Arrange
      const user = userEvent.setup()
      render(<TestStepDialog {...defaultProps} />, { wrapper })

      // Act
      await user.click(screen.getByRole('button', { name: 'Set mock data' }))

      // Assert
      expect(screen.getByRole('heading', { name: 'Set mock data for Test Script' })).toBeInTheDocument()
      expect(screen.getByTestId('code-textarea')).toBeInTheDocument()
    })

    it('closes dialog when Cancel is clicked', async () => {
      // Arrange
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<TestStepDialog {...defaultProps} onClose={onClose} />, { wrapper })

      // Act
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      // Assert
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('has no accessibility violations in choice state', async () => {
      // Arrange
      const { container } = render(<TestStepDialog {...defaultProps} />, { wrapper })

      // Act
      const results = await axe(container)

      // Assert
      expect(results).toHaveNoViolations()
    })
  })

  describe('Mock Editor State', () => {
    async function openMockEditor() {
      const user = userEvent.setup()
      const view = render(<TestStepDialog {...defaultProps} />, { wrapper })
      await user.click(screen.getByRole('button', { name: 'Set mock data' }))
      return { user, ...view }
    }

    it('renders mock editor with JSON input area', async () => {
      // Arrange & Act
      await openMockEditor()

      // Assert
      expect(screen.getByRole('heading', { name: 'Set mock data for Test Script' })).toBeInTheDocument()
      expect(screen.getByTestId('code-textarea')).toBeInTheDocument()
      expect(screen.getByText(/Provide mock output data for the previous step/)).toBeInTheDocument()
    })

    it('allows entering JSON in the textarea', async () => {
      // Arrange
      const { user } = await openMockEditor()
      const textarea = screen.getByTestId('code-textarea')

      // Act
      await user.clear(textarea)
      await user.click(textarea)
      await user.paste('{"key": "value"}')

      // Assert
      expect(textarea).toHaveValue('{"key": "value"}')
    })

    it('validates JSON and shows error for invalid input', async () => {
      // Arrange
      const { user } = await openMockEditor()
      const textarea = screen.getByTestId('code-textarea')

      // Act
      await user.clear(textarea)
      await user.click(textarea)
      await user.paste('{invalid json')
      await user.click(screen.getByRole('button', { name: 'Run' }))

      // Assert — Error message may vary by browser/runtime
      expect(screen.getByText(/Unexpected|expected/i)).toBeInTheDocument()
    })

    it('calls onClose when Run is clicked with valid JSON', async () => {
      // Arrange
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<TestStepDialog {...defaultProps} onClose={onClose} />, { wrapper })
      await user.click(screen.getByRole('button', { name: 'Set mock data' }))
      const textarea = screen.getByTestId('code-textarea')

      // Act
      await user.clear(textarea)
      await user.click(textarea)
      await user.paste('{"hostname": "server1"}')
      await user.click(screen.getByRole('button', { name: 'Run' }))

      // Assert — waits for SUCCESS_AUTO_CLOSE_DELAY_MS timer to fire
      await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 1500 })
    })

    it('calls onClose when Run is clicked with empty JSON', async () => {
      // Arrange
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<TestStepDialog {...defaultProps} onClose={onClose} />, { wrapper })
      await user.click(screen.getByRole('button', { name: 'Set mock data' }))

      // Act
      await user.click(screen.getByRole('button', { name: 'Run' }))

      // Assert — waits for SUCCESS_AUTO_CLOSE_DELAY_MS timer to fire
      await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 1500 })
    })

    it('closes dialog when Cancel is clicked from mock editor', async () => {
      // Arrange
      const onClose = vi.fn()
      render(<TestStepDialog {...defaultProps} onClose={onClose} />, { wrapper })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Set mock data' }))

      // Act
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      // Assert
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('has no accessibility violations in mock editor state', async () => {
      // Arrange
      const { container } = render(<TestStepDialog {...defaultProps} />, { wrapper })
      const user = userEvent.setup()

      // Act
      await user.click(screen.getByRole('button', { name: 'Set mock data' }))
      const results = await axe(container)

      // Assert
      expect(results).toHaveNoViolations()
    })
  })

  describe('State Reset', () => {
    it('resets to choice dialog when closed via Cancel', async () => {
      // Arrange
      const user = userEvent.setup()
      const onClose = vi.fn()
      const { rerender } = render(<TestStepDialog {...defaultProps} onClose={onClose} />, { wrapper })

      // Act 1 — Transition to mock editor
      await user.click(screen.getByRole('button', { name: 'Set mock data' }))
      expect(screen.getByRole('heading', { name: 'Set mock data for Test Script' })).toBeInTheDocument()

      // Act 2 — Close via Cancel button (triggers handleClose which resets state)
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      // Assert — onClose called and state reset on next open
      expect(onClose).toHaveBeenCalled()
      rerender(
        <ColorSchemeProvider>
          <TestStepDialog {...defaultProps} onClose={onClose} isOpen />
        </ColorSchemeProvider>
      )
      expect(screen.getByRole('heading', { name: 'Run Test Script?' })).toBeInTheDocument()
    })

    it('clears mock JSON when closed', async () => {
      // Arrange
      const user = userEvent.setup()
      const onClose = vi.fn()
      const { rerender } = render(<TestStepDialog {...defaultProps} onClose={onClose} />, { wrapper })

      // Act 1 — Enter JSON
      await user.click(screen.getByRole('button', { name: 'Set mock data' }))
      const textarea = screen.getByTestId('code-textarea')
      await user.click(textarea)
      await user.paste('{"test": "data"}')

      // Act 2 — Close and reopen
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onClose).toHaveBeenCalled()
      rerender(
        <ColorSchemeProvider>
          <TestStepDialog {...defaultProps} onClose={onClose} isOpen />
        </ColorSchemeProvider>
      )
      await user.click(screen.getByRole('button', { name: 'Set mock data' }))

      // Assert
      const newTextarea = screen.getByTestId('code-textarea')
      expect(newTextarea).toHaveValue('')
    })
  })

  describe('Button Placement', () => {
    it('has primary action leftmost in choice dialog', () => {
      // Arrange
      render(<TestStepDialog {...defaultProps} />, { wrapper })

      // Act
      const footer = screen.getByRole('button', { name: 'Run all previous nodes' }).closest('footer')
      const buttons = within(footer!).getAllByRole('button')

      // Assert — Primary (Run all) | Secondary (Set mock) | Link (Cancel)
      expect(buttons[0]).toHaveTextContent('Run all previous nodes')
      expect(buttons[1]).toHaveTextContent('Set mock data')
      expect(buttons[2]).toHaveTextContent('Cancel')
    })

    it('has primary action leftmost in mock editor', async () => {
      // Arrange
      const user = userEvent.setup()
      render(<TestStepDialog {...defaultProps} />, { wrapper })
      await user.click(screen.getByRole('button', { name: 'Set mock data' }))

      // Act
      const footer = screen.getByRole('button', { name: 'Run' }).closest('footer')
      const buttons = within(footer!).getAllByRole('button')

      // Assert — Primary (Run) | Link (Cancel)
      expect(buttons[0]).toHaveTextContent('Run')
      expect(buttons[1]).toHaveTextContent('Cancel')
    })
  })
})
