import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import { useBlocker } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { isTanStackRouter } from '../../app/routerFlag'
import { useLocation } from '../../hooks/routing/useLocation'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useWorkflowStore } from '../../stores/useWorkflowStore'

import { UnsavedChangesContext } from './unsavedChangesContext'

type UnsavedChangesProviderProps = {
  children: ReactNode
}

// Module-scope component (satisfies no-nested-components rule, CLAUDE.md §11).
// Only rendered when the TanStack router is active (inside RouterProvider).
// useBlocker intercepts navigation away from the builder while the workflow is
// dirty; onBlock hands proceed/reset up to the modal so the user can confirm.
function TanStackNavigationBlocker({ onBlock }: { onBlock: (proceed: () => void, reset: () => void) => void }) {
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      useWorkflowStore.getState().isDirty &&
      current.pathname.startsWith('/workflow-builder') &&
      !next.pathname.startsWith('/workflow-builder'),
    enableBeforeUnload: () =>
      useWorkflowStore.getState().isDirty && globalThis.location.pathname.startsWith('/workflow-builder'),
    withResolver: true,
  })

  useEffect(() => {
    if (blocker.status === 'blocked' && blocker.proceed && blocker.reset) {
      onBlock(blocker.proceed, blocker.reset)
    }
  }, [blocker.status, blocker.proceed, blocker.reset, onBlock])

  return null
}

export function UnsavedChangesProvider({ children }: Readonly<UnsavedChangesProviderProps>) {
  // Wouter path: hooks read current location / provide navigate fn directly.
  // TanStack path: hooks delegate to useRouterState / useNavigate from @tanstack/react-router,
  // which are available here because AppShell (our parent) is inside RouterProvider.
  const location = useLocation()
  const navigate = useNavigate()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveHandler, setSaveHandler] = useState<(() => Promise<boolean>) | null>(null)

  // TanStack path: proceed() resumes the intercepted navigation; reset() cancels it.
  // Both are provided by TanStackNavigationBlocker via useBlocker({ withResolver: true }).
  const proceedNavRef = useRef<(() => void) | null>(null)
  const resetNavRef = useRef<(() => void) | null>(null)

  const { setWorkflow, setEdges } = useWorkflowStore()

  // Called by TanStackNavigationBlocker when useBlocker intercepts a navigation
  // attempt away from a dirty builder. Opens the modal and stores the callbacks.
  const handleTanStackBlock = useCallback((proceed: () => void, reset: () => void) => {
    proceedNavRef.current = proceed
    resetNavRef.current = reset
    setIsModalOpen(true)
  }, [])

  // ── Wouter: check if we're on a builder route with unsaved changes ─────────
  const hasUnsavedChanges = useCallback(() => {
    const isOnBuilder = location.startsWith('/workflow-builder')
    const currentIsDirty = useWorkflowStore.getState().isDirty
    if (!isOnBuilder) return false
    return currentIsDirty
  }, [location])

  // ── requestNavigation ──────────────────────────────────────────────────────
  // TanStack path: just navigate — TanStackNavigationBlocker (useBlocker) is the gatekeeper.
  // Wouter path: check for unsaved changes and possibly show modal.
  const requestNavigation = useCallback(
    (targetPath: string) => {
      if (isTanStackRouter()) {
        navigate(targetPath)
        return
      }

      if (targetPath.startsWith('/workflow-builder') || !hasUnsavedChanges()) {
        navigate(targetPath)
        return
      }

      setPendingTarget(targetPath)
      setIsModalOpen(true)
    },
    [hasUnsavedChanges, navigate]
  )

  const registerSaveHandler = useCallback((handler: () => Promise<boolean>) => {
    setSaveHandler(() => handler)
  }, [])

  const unregisterSaveHandler = useCallback(() => {
    setSaveHandler(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!saveHandler) {
      // eslint-disable-next-line no-console
      console.error('[UnsavedChangesModal] No save handler registered')
      return
    }

    setIsSaving(true)
    const success = await saveHandler()
    setIsSaving(false)

    if (success) {
      setWorkflow(null)
      setEdges([])
      setIsModalOpen(false)

      if (isTanStackRouter()) {
        // Resume the intercepted navigation via the proceed callback from useBlocker.
        proceedNavRef.current?.()
        proceedNavRef.current = null
        resetNavRef.current = null
      } else if (pendingTarget) {
        navigate(pendingTarget)
        setPendingTarget(null)
      }
    } else {
      // Save failed — cancel the intercepted navigation, close modal, user stays in builder.
      setIsModalOpen(false)
      if (isTanStackRouter()) {
        resetNavRef.current?.()
        proceedNavRef.current = null
        resetNavRef.current = null
      } else {
        setPendingTarget(null)
      }
    }
  }, [saveHandler, pendingTarget, setWorkflow, setEdges, navigate])

  const handleExitWithoutSaving = useCallback(() => {
    setWorkflow(null)
    setEdges([])
    setIsModalOpen(false)

    if (isTanStackRouter()) {
      proceedNavRef.current?.()
      proceedNavRef.current = null
      resetNavRef.current = null
    } else if (pendingTarget) {
      navigate(pendingTarget)
      setPendingTarget(null)
    }
  }, [pendingTarget, setWorkflow, setEdges, navigate])

  const handleClose = useCallback(() => {
    setIsModalOpen(false)
    if (isTanStackRouter()) {
      // Cancel the intercepted navigation so TanStack router isn't left in a blocked state.
      resetNavRef.current?.()
      proceedNavRef.current = null
      resetNavRef.current = null
    } else {
      setPendingTarget(null)
    }
  }, [])

  const contextValue = useMemo(
    () => ({ requestNavigation, registerSaveHandler, unregisterSaveHandler }),
    [requestNavigation, registerSaveHandler, unregisterSaveHandler]
  )

  return (
    <UnsavedChangesContext.Provider value={contextValue}>
      {isTanStackRouter() && <TanStackNavigationBlocker onBlock={handleTanStackBlock} />}
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
          <Button
            key="save"
            variant="primary"
            onClick={handleSave}
            isLoading={isSaving}
            isDisabled={isSaving || !saveHandler}
          >
            Save workflow
          </Button>
          <Button key="exit" variant="secondary" onClick={handleExitWithoutSaving} isDisabled={isSaving}>
            Exit without saving
          </Button>
          <Button key="cancel" variant="link" onClick={handleClose} isDisabled={isSaving}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </UnsavedChangesContext.Provider>
  )
}
