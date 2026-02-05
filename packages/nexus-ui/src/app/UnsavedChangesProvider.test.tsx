import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkflowStore } from '../stores/useWorkflowStore'

import { UnsavedChangesProvider } from './UnsavedChangesProvider'
import { useUnsavedChanges } from './useUnsavedChanges'

// Mock wouter - needed to control current location and capture navigation calls
const mockSetLocation = vi.fn()
let mockLocation = '/automation-builder/123'

vi.mock('wouter', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useLocation: () => [mockLocation, mockSetLocation],
  }
})

// Mock workflow store - needed to control isDirty state and capture state clearing
vi.mock('../stores/useWorkflowStore', () => ({
  useWorkflowStore: vi.fn(),
}))

// Test helper component
function TestConsumer({
  targetPath = '/automations',
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
    mockLocation = '/automation-builder/123'

    vi.mocked(useWorkflowStore).mockReturnValue({
      setWorkflow: mockSetWorkflow,
      setEdges: mockSetEdges,
    })

    vi.mocked(useWorkflowStore).getState = vi.fn().mockReturnValue({
      isDirty: true,
    })
  })

  describe('when navigating with unsaved changes', () => {
    it('shows warning modal', () => {
      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      fireEvent.click(screen.getByText('Navigate Away'))

      expect(screen.getByText('Save changes before exiting the automation builder?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Exit without saving' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled() // No handler registered
    })

    it('exits without saving when choosing to discard changes', () => {
      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      fireEvent.click(screen.getByText('Navigate Away'))
      fireEvent.click(screen.getByRole('button', { name: 'Exit without saving' }))

      expect(mockSetWorkflow).toHaveBeenCalledWith(null)
      expect(mockSetEdges).toHaveBeenCalledWith([])
      expect(mockSetLocation).toHaveBeenCalledWith('/automations')
    })

    it('saves and navigates when save succeeds', async () => {
      const saveHandler = vi.fn().mockResolvedValue(true)

      render(
        <UnsavedChangesProvider>
          <TestConsumer saveHandler={saveHandler} />
        </UnsavedChangesProvider>
      )

      fireEvent.click(screen.getByText('Register Handler'))
      fireEvent.click(screen.getByText('Navigate Away'))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(saveHandler).toHaveBeenCalled()
        expect(mockSetLocation).toHaveBeenCalledWith('/automations')
      })
    })

    it('closes modal without navigating when save fails', async () => {
      const saveHandler = vi.fn().mockResolvedValue(false)

      render(
        <UnsavedChangesProvider>
          <TestConsumer saveHandler={saveHandler} />
        </UnsavedChangesProvider>
      )

      fireEvent.click(screen.getByText('Register Handler'))
      fireEvent.click(screen.getByText('Navigate Away'))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(saveHandler).toHaveBeenCalled()
        expect(screen.queryByText('Save changes before exiting the automation builder?')).not.toBeInTheDocument()
      })

      expect(mockSetLocation).not.toHaveBeenCalled()
    })

    it('stays on page when modal is closed', () => {
      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      fireEvent.click(screen.getByText('Navigate Away'))
      fireEvent.click(screen.getByRole('button', { name: /close/i }))

      expect(screen.queryByText('Save changes before exiting the automation builder?')).not.toBeInTheDocument()
      expect(mockSetLocation).not.toHaveBeenCalled()
    })

    it('disables buttons while save is in progress', async () => {
      let resolveSave!: (value: boolean) => void
      const saveHandler = vi.fn().mockImplementation(() => new Promise((resolve) => (resolveSave = resolve)))

      render(
        <UnsavedChangesProvider>
          <TestConsumer saveHandler={saveHandler} />
        </UnsavedChangesProvider>
      )

      fireEvent.click(screen.getByText('Register Handler'))
      fireEvent.click(screen.getByText('Navigate Away'))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Exit without saving' })).toBeDisabled()
      })

      resolveSave(true)

      await waitFor(() => {
        expect(screen.queryByText('Save changes before exiting the automation builder?')).not.toBeInTheDocument()
      })
    })
  })

  describe('when navigation should proceed immediately', () => {
    it('navigates without modal when staying within builder', () => {
      render(
        <UnsavedChangesProvider>
          <TestConsumer targetPath="/automation-builder/456" />
        </UnsavedChangesProvider>
      )

      fireEvent.click(screen.getByText('Navigate Away'))

      expect(screen.queryByText('Save changes before exiting the automation builder?')).not.toBeInTheDocument()
      expect(mockSetLocation).toHaveBeenCalledWith('/automation-builder/456')
    })

    it('navigates without modal when no unsaved changes', () => {
      vi.mocked(useWorkflowStore).getState = vi.fn().mockReturnValue({ isDirty: false })

      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      fireEvent.click(screen.getByText('Navigate Away'))

      expect(screen.queryByText('Save changes before exiting the automation builder?')).not.toBeInTheDocument()
      expect(mockSetLocation).toHaveBeenCalledWith('/automations')
    })

    it('navigates without modal when not on builder route', () => {
      mockLocation = '/automations'

      render(
        <UnsavedChangesProvider>
          <TestConsumer />
        </UnsavedChangesProvider>
      )

      fireEvent.click(screen.getByText('Navigate Away'))

      expect(screen.queryByText('Save changes before exiting the automation builder?')).not.toBeInTheDocument()
      expect(mockSetLocation).toHaveBeenCalledWith('/automations')
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
