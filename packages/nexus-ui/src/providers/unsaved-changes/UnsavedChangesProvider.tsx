import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'

import { useWorkflowStore } from '../../stores/useWorkflowStore'

import { UnsavedChangesContext } from './unsavedChangesContext'

type UnsavedChangesProviderProps = {
  children: ReactNode
}

export function UnsavedChangesProvider({ children }: Readonly<UnsavedChangesProviderProps>) {
  const [location, setLocation] = useLocation()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveHandler, setSaveHandler] = useState<(() => Promise<boolean>) | null>(null)

  const { setWorkflow, setEdges } = useWorkflowStore()

  // Check if we're on a builder route with unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    const isOnBuilder = location.startsWith('/workflow-builder')
    // Get the current isDirty directly from store to avoid stale closure
    const currentIsDirty = useWorkflowStore.getState().isDirty
    if (!isOnBuilder) return false
    return currentIsDirty
  }, [location])

  // Request navigation - may show modal if unsaved changes exist
  const requestNavigation = useCallback(
    (targetPath: string) => {
      // If navigating within builder or no unsaved changes, proceed immediately
      if (targetPath.startsWith('/workflow-builder') || !hasUnsavedChanges()) {
        setLocation(targetPath)
        return
      }

      // Show confirmation modal
      setPendingTarget(targetPath)
      setIsModalOpen(true)
    },
    [hasUnsavedChanges, setLocation]
  )

  // Register save handler from BuilderContent
  const registerSaveHandler = useCallback((handler: () => Promise<boolean>) => {
    setSaveHandler(() => handler)
  }, [])

  // Unregister save handler
  const unregisterSaveHandler = useCallback(() => {
    setSaveHandler(null)
  }, [])

  // Handle save button click
  const handleSave = useCallback(async () => {
    if (!saveHandler) {
      // eslint-disable-next-line no-console
      console.error('[UnsavedChangesModal] No save handler registered')
      return
    }

    setIsSaving(true)
    const success = await saveHandler()
    setIsSaving(false)

    if (success && pendingTarget) {
      // Clear workflow state and navigate
      setWorkflow(null)
      setEdges([])
      setIsModalOpen(false)
      setLocation(pendingTarget)
      setPendingTarget(null)
    } else if (!success) {
      // Save failed - close modal, user stays in builder with error toast
      setIsModalOpen(false)
      setPendingTarget(null)
    }
  }, [saveHandler, pendingTarget, setWorkflow, setEdges, setLocation])

  // Handle exit without saving
  const handleExitWithoutSaving = useCallback(() => {
    if (pendingTarget) {
      setWorkflow(null)
      setEdges([])
      setIsModalOpen(false)
      setLocation(pendingTarget)
      setPendingTarget(null)
    }
  }, [pendingTarget, setWorkflow, setEdges, setLocation])

  // Handle modal close (cancel)
  const handleClose = useCallback(() => {
    setIsModalOpen(false)
    setPendingTarget(null)
  }, [])

  const contextValue = useMemo(
    () => ({ requestNavigation, registerSaveHandler, unregisterSaveHandler }),
    [requestNavigation, registerSaveHandler, unregisterSaveHandler]
  )

  return (
    <UnsavedChangesContext.Provider value={contextValue}>
      {children}

      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        aria-labelledby="unsaved-changes-modal-title"
        aria-describedby="unsaved-changes-modal-body"
        variant="medium"
      >
        <ModalHeader title="Save changes before exiting the workflow builder?" titleIconVariant="warning" />
        <ModalBody id="unsaved-changes-modal-body">
          Exiting now will permanently delete all recent unsaved progress on your workflow. Please save your work before
          leaving.
        </ModalBody>
        <ModalFooter>
          <Button key="exit" variant="secondary" onClick={handleExitWithoutSaving} isDisabled={isSaving}>
            Exit without saving
          </Button>
          <Button
            key="save"
            variant="primary"
            onClick={handleSave}
            isLoading={isSaving}
            isDisabled={isSaving || !saveHandler}
          >
            Save
          </Button>
        </ModalFooter>
      </Modal>
    </UnsavedChangesContext.Provider>
  )
}
