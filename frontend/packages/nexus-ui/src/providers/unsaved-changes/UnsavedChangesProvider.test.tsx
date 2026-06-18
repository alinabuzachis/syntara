import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useUnsavedChanges } from '../../app/useUnsavedChanges'
import { useWorkflowStore } from '../../stores/useWorkflowStore'

import { UnsavedChangesProvider } from './UnsavedChangesProvider'

// Mock routing bridge hooks
const mockNavigate = vi.fn()
let mockLocation = '/workflow-builder/123'

vi.mock('../../hooks/routing/useLocation', () => ({
  useLocation: () => mockLocation,
}))

vi.mock('../../hooks/routing/useNavigate', () => ({
  useNavigate: () => mockNavigate,
}))

// Mock workflow store - needed to control isDirty state and capture state clearing
vi.mock('../../stores/useWorkflowStore', () => ({
  useWorkflowStore: vi.fn(),
}))

// Test helper component
function TestConsumer({
  targetPath = '/workflows',
  saveHandler,
}: {
  targetPath?: string
  saveHandler?: () => Promise<boolean>
}) {
  const { requestNavigation, registerSaveHandler } = useUnsavedChanges()

  return (
    <div>
      <button onClick={() => requestNavigation(targetPath)}>Navigate Away</button>
      {saveHandler && <button onClick={() => registerSaveHandler(saveHandler)}>Register Handler</button>}
    </div>
  )
}

describe('UnsavedChangesProvider', () => {
  const mockSetWorkflow = vi.fn()
  const mockSetEdges = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation = '/workflow-builder/123'

    vi.mocked(useWorkflowStore).mockReturnValue({
      setWorkflow: mockSetWorkflow,
      setEdges: mockSetEdges,
    })

    vi.mocked(useWorkflowStore).getState = vi.fn().mockReturnValue({
      isDirty: true,
    })
  })

  describe('when navigating with unsaved changes', () => {
    it('shows warning modal', async () => {
      const user = userEvent.setup()
      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Navigate Away'))

      expect(screen.getByText('Save changes before exiting the workflow builder?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save workflow' })).toBeDisabled() // No handler registered
      expect(screen.getByRole('button', { name: 'Exit without saving' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('exits without saving when choosing to discard changes', async () => {
      const user = userEvent.setup()
      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Navigate Away'))
      await user.click(screen.getByRole('button', { name: 'Exit without saving' }))

      expect(mockSetWorkflow).toHaveBeenCalledWith(null)
      expect(mockSetEdges).toHaveBeenCalledWith([])
      expect(mockNavigate).toHaveBeenCalledWith('/workflows')
    })

    it('saves and navigates when save succeeds', async () => {
      const user = userEvent.setup()
      const saveHandler = vi.fn().mockResolvedValue(true)

      render(
        <UnsavedChangesProvider>
          <TestConsumer saveHandler={saveHandler} />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Register Handler'))
      await user.click(screen.getByText('Navigate Away'))
      await user.click(screen.getByRole('button', { name: 'Save workflow' }))

      await waitFor(() => {
        expect(saveHandler).toHaveBeenCalled()
        expect(mockNavigate).toHaveBeenCalledWith('/workflows')
      })
    })

    it('closes modal without navigating when save fails', async () => {
      const user = userEvent.setup()
      const saveHandler = vi.fn().mockResolvedValue(false)

      render(
        <UnsavedChangesProvider>
          <TestConsumer saveHandler={saveHandler} />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Register Handler'))
      await user.click(screen.getByText('Navigate Away'))
      await user.click(screen.getByRole('button', { name: 'Save workflow' }))

      await waitFor(() => {
        expect(saveHandler).toHaveBeenCalled()
        expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
      })

      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('stays on page when modal is closed', async () => {
      const user = userEvent.setup()
      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Navigate Away'))
      await user.click(screen.getByRole('button', { name: /close/i }))

      expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('disables buttons while save is in progress', async () => {
      const user = userEvent.setup()
      let resolveSave!: (value: boolean) => void
      const saveHandler = vi.fn().mockImplementation(() => new Promise((resolve) => (resolveSave = resolve)))

      render(
        <UnsavedChangesProvider>
          <TestConsumer saveHandler={saveHandler} />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Register Handler'))
      await user.click(screen.getByText('Navigate Away'))
      await user.click(screen.getByRole('button', { name: 'Save workflow' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Exit without saving' })).toBeDisabled()
      })

      resolveSave(true)

      await waitFor(() => {
        expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
      })
    })
  })

  describe('when navigation should proceed immediately', () => {
    it('navigates without modal when staying within builder', async () => {
      const user = userEvent.setup()
      render(
        <UnsavedChangesProvider>
          <TestConsumer targetPath="/workflow-builder/456" />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Navigate Away'))

      expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
      expect(mockNavigate).toHaveBeenCalledWith('/workflow-builder/456')
    })

    it('navigates without modal when no unsaved changes', async () => {
      const user = userEvent.setup()
      vi.mocked(useWorkflowStore).getState = vi.fn().mockReturnValue({ isDirty: false })

      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Navigate Away'))

      expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
      expect(mockNavigate).toHaveBeenCalledWith('/workflows')
    })

    it('navigates without modal when not on builder route', async () => {
      const user = userEvent.setup()
      mockLocation = '/workflows'

      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Navigate Away'))

      expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
      expect(mockNavigate).toHaveBeenCalledWith('/workflows')
    })
  })

  describe('save handler registration', () => {
    it('disables save button when no handler is registered', async () => {
      const user = userEvent.setup()

      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Navigate Away'))

      expect(screen.getByRole('button', { name: 'Save workflow' })).toBeDisabled()
    })

    it('clears save handler when unregisterSaveHandler is called', async () => {
      const user = userEvent.setup()
      const saveHandler = vi.fn().mockResolvedValue(true)

      function TestUnregister() {
        const { requestNavigation, registerSaveHandler, unregisterSaveHandler } = useUnsavedChanges()
        return (
          <div>
            <button onClick={() => registerSaveHandler(saveHandler)}>Register</button>
            <button onClick={unregisterSaveHandler}>Unregister</button>
            <button onClick={() => requestNavigation('/workflows')}>Navigate Away</button>
          </div>
        )
      }

      render(
        <UnsavedChangesProvider>
          <TestUnregister />
        </UnsavedChangesProvider>
      )

      await user.click(screen.getByText('Register'))
      await user.click(screen.getByText('Unregister'))
      await user.click(screen.getByText('Navigate Away'))

      expect(screen.getByRole('button', { name: 'Save workflow' })).toBeDisabled()
    })
  })

  describe('useUnsavedChanges hook', () => {
    it('throws when used outside provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => render(<TestConsumer />)).toThrow('useUnsavedChanges must be used within UnsavedChangesProvider')

      consoleSpy.mockRestore()
    })
  })
})

// ── TanStack router path ──────────────────────────────────────────────────────
//
// Each test uses vi.resetModules() + vi.doMock() so that the TanStack flag and
// useBlocker are controlled per-test. Dynamic imports are used inside each test
// to get fresh module instances that see the newly registered mocks.
describe('UnsavedChangesProvider (TanStack router path)', () => {
  const mockProceed = vi.fn()
  const mockReset = vi.fn()
  const mockSetWorkflow = vi.fn()
  const mockSetEdges = vi.fn()

  let mockBlockerState: { status: string; proceed?: () => void; reset?: () => void } = { status: 'idle' }

  beforeEach(() => {
    vi.clearAllMocks()
    mockBlockerState = { status: 'idle' }

    vi.resetModules()
    vi.doMock('../../app/routerFlag', () => ({ isTanStackRouter: () => true }))
    vi.doMock('@tanstack/react-router', () => ({
      useBlocker: vi.fn(() => mockBlockerState),
    }))
    vi.doMock('../../stores/useWorkflowStore', () => ({
      useWorkflowStore: Object.assign(
        vi.fn().mockReturnValue({ setWorkflow: mockSetWorkflow, setEdges: mockSetEdges }),
        { getState: vi.fn().mockReturnValue({ isDirty: true }) }
      ),
    }))
    vi.doMock('../../hooks/routing/useLocation', () => ({ useLocation: () => '/workflow-builder/123' }))
    vi.doMock('../../hooks/routing/useNavigate', () => ({ useNavigate: () => mockNavigate }))
  })

  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('navigates directly without showing modal', async () => {
    const user = userEvent.setup()
    const { UnsavedChangesProvider } = await import('./UnsavedChangesProvider')
    const { useUnsavedChanges: useTanStackUnsavedChanges } = await import('../../app/useUnsavedChanges')

    function TestNav() {
      const { requestNavigation } = useTanStackUnsavedChanges()
      return <button onClick={() => requestNavigation('/workflows')}>Navigate Away</button>
    }

    render(
      <UnsavedChangesProvider>
        <TestNav />
      </UnsavedChangesProvider>
    )

    await user.click(screen.getByText('Navigate Away'))

    expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
    expect(mockNavigate).toHaveBeenCalledWith('/workflows')
  })

  it('shows modal when TanStack router blocks navigation', async () => {
    mockBlockerState = { status: 'blocked', proceed: mockProceed, reset: mockReset }

    const { UnsavedChangesProvider } = await import('./UnsavedChangesProvider')

    render(
      <UnsavedChangesProvider>
        <div />
      </UnsavedChangesProvider>
    )

    expect(await screen.findByText('Save changes before exiting the workflow builder?')).toBeInTheDocument()
  })

  it('calls proceed and clears workflow state when exiting without saving', async () => {
    const user = userEvent.setup()
    mockBlockerState = { status: 'blocked', proceed: mockProceed, reset: mockReset }

    const { UnsavedChangesProvider } = await import('./UnsavedChangesProvider')

    render(
      <UnsavedChangesProvider>
        <div />
      </UnsavedChangesProvider>
    )

    await screen.findByText('Save changes before exiting the workflow builder?')
    await user.click(screen.getByRole('button', { name: 'Exit without saving' }))

    expect(mockSetWorkflow).toHaveBeenCalledWith(null)
    expect(mockSetEdges).toHaveBeenCalledWith([])
    expect(mockProceed).toHaveBeenCalled()
    expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
  })

  it('calls proceed after a successful save', async () => {
    const user = userEvent.setup()
    mockBlockerState = { status: 'blocked', proceed: mockProceed, reset: mockReset }
    const saveHandler = vi.fn().mockResolvedValue(true)

    const { UnsavedChangesProvider } = await import('./UnsavedChangesProvider')
    const { useUnsavedChanges: useTanStackUnsavedChanges } = await import('../../app/useUnsavedChanges')

    function TestNav() {
      const { registerSaveHandler } = useTanStackUnsavedChanges()
      return <button onClick={() => registerSaveHandler(saveHandler)}>Register Handler</button>
    }

    render(
      <UnsavedChangesProvider>
        <TestNav />
      </UnsavedChangesProvider>
    )

    await screen.findByText('Save changes before exiting the workflow builder?')
    await user.click(screen.getByText('Register Handler'))
    await user.click(screen.getByRole('button', { name: 'Save workflow' }))

    await waitFor(() => {
      expect(saveHandler).toHaveBeenCalled()
      expect(mockProceed).toHaveBeenCalled()
    })
    expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
  })

  it('calls reset when save fails', async () => {
    const user = userEvent.setup()
    mockBlockerState = { status: 'blocked', proceed: mockProceed, reset: mockReset }
    const saveHandler = vi.fn().mockResolvedValue(false)

    const { UnsavedChangesProvider } = await import('./UnsavedChangesProvider')
    const { useUnsavedChanges: useTanStackUnsavedChanges } = await import('../../app/useUnsavedChanges')

    function TestNav() {
      const { registerSaveHandler } = useTanStackUnsavedChanges()
      return <button onClick={() => registerSaveHandler(saveHandler)}>Register Handler</button>
    }

    render(
      <UnsavedChangesProvider>
        <TestNav />
      </UnsavedChangesProvider>
    )

    await screen.findByText('Save changes before exiting the workflow builder?')
    await user.click(screen.getByText('Register Handler'))
    await user.click(screen.getByRole('button', { name: 'Save workflow' }))

    await waitFor(() => {
      expect(saveHandler).toHaveBeenCalled()
      expect(mockReset).toHaveBeenCalled()
    })
  })

  it('does not show modal when blocker status is idle', async () => {
    mockBlockerState = { status: 'idle' }

    const { UnsavedChangesProvider } = await import('./UnsavedChangesProvider')

    render(
      <UnsavedChangesProvider>
        <div>content</div>
      </UnsavedChangesProvider>
    )

    expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
  })

  it('calls reset when the modal is cancelled', async () => {
    const user = userEvent.setup()
    mockBlockerState = { status: 'blocked', proceed: mockProceed, reset: mockReset }

    const { UnsavedChangesProvider } = await import('./UnsavedChangesProvider')

    render(
      <UnsavedChangesProvider>
        <div />
      </UnsavedChangesProvider>
    )

    await screen.findByText('Save changes before exiting the workflow builder?')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockReset).toHaveBeenCalled()
    expect(screen.queryByText('Save changes before exiting the workflow builder?')).not.toBeInTheDocument()
  })
})
