import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUnsavedChanges } from '../../app/useUnsavedChanges'
import { useWorkflowStore } from '../../stores/useWorkflowStore'

import { UnsavedChangesProvider } from './UnsavedChangesProvider'

// Mock wouter - needed to control current location and capture navigation calls
const mockSetLocation = vi.fn()
let mockLocation = '/workflow-builder/123'

vi.mock('wouter', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    useLocation: () => [mockLocation, mockSetLocation],
  }
})

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
      expect(mockSetLocation).toHaveBeenCalledWith('/workflows')
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
        expect(mockSetLocation).toHaveBeenCalledWith('/workflows')
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

      expect(mockSetLocation).not.toHaveBeenCalled()
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
      expect(mockSetLocation).not.toHaveBeenCalled()
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
      expect(mockSetLocation).toHaveBeenCalledWith('/workflow-builder/456')
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
      expect(mockSetLocation).toHaveBeenCalledWith('/workflows')
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
      expect(mockSetLocation).toHaveBeenCalledWith('/workflows')
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
