import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import { useBlocker } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { isTanStackRouter } from '../../app/routerFlag'
import { useLocation } from '../../hooks/routing/useLocation'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useWorkflowStore } from '../../stores/useWorkflowStore'

import { UnsavedChangesContext, type DirtyCheckOptions } from './unsavedChangesContext'

type UnsavedChangesProviderProps = {
  children: ReactNode
}

function TanStackNavigationBlocker({
  onBlock,
  dirtyChecksRef,
}: {
  onBlock: (proceed: () => void, reset: () => void) => void
  dirtyChecksRef: React.RefObject<Map<number, DirtyCheckOptions>>
}) {
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => {
      const builderDirty =
        useWorkflowStore.getState().isDirty &&
        current.pathname.startsWith('/workflow-builder') &&
        !next.pathname.startsWith('/workflow-builder')
      const genericDirty = Array.from(dirtyChecksRef.current.values()).some((e) => e.check())
      return builderDirty || genericDirty
    },
    enableBeforeUnload: () => {
      const builderDirty =
        useWorkflowStore.getState().isDirty && globalThis.location.pathname.startsWith('/workflow-builder')
      const genericDirty = Array.from(dirtyChecksRef.current.values()).some((e) => e.check())
      return builderDirty || genericDirty
    },
    withResolver: true,
  })

  useEffect(() => {
    if (blocker.status === 'blocked' && blocker.proceed && blocker.reset) {
      onBlock(blocker.proceed, blocker.reset)
    }
  }, [blocker.status, blocker.proceed, blocker.reset, onBlock])

  return null
}

let dirtyCheckIdCounter = 0

export function UnsavedChangesProvider({ children }: Readonly<UnsavedChangesProviderProps>) {
  const location = useLocation()
  const navigate = useNavigate()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveHandler, setSaveHandler] = useState<(() => Promise<boolean>) | null>(null)

  const proceedNavRef = useRef<(() => void) | null>(null)
  const resetNavRef = useRef<(() => void) | null>(null)
  const pendingTargetRef = useRef<string | null>(null)

  const dirtyChecksRef = useRef(new Map<number, DirtyCheckOptions>())

  const { setWorkflow, setEdges } = useWorkflowStore()

  const handleTanStackBlock = useCallback((proceed: () => void, reset: () => void) => {
    proceedNavRef.current = proceed
    resetNavRef.current = reset
    setIsModalOpen(true)
  }, [])

  const isBuilderDirty = useCallback(() => {
    const isOnBuilder = location.startsWith('/workflow-builder')
    return isOnBuilder && useWorkflowStore.getState().isDirty
  }, [location])

  const getActiveDirtyCheck = useCallback((): DirtyCheckOptions | null => {
    for (const entry of dirtyChecksRef.current.values()) {
      if (entry.check()) return entry
    }
    return null
  }, [])

  const hasUnsavedChanges = useCallback(() => {
    if (isBuilderDirty()) return true
    return getActiveDirtyCheck() !== null
  }, [isBuilderDirty, getActiveDirtyCheck])

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

      pendingTargetRef.current = targetPath
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

  const registerDirtyCheck = useCallback((options: DirtyCheckOptions) => {
    const id = ++dirtyCheckIdCounter
    dirtyChecksRef.current.set(id, options)
    return () => {
      dirtyChecksRef.current.delete(id)
    }
  }, [])

  const proceedNavigation = useCallback(() => {
    setIsModalOpen(false)
    if (isTanStackRouter()) {
      proceedNavRef.current?.()
      proceedNavRef.current = null
      resetNavRef.current = null
    } else if (pendingTargetRef.current) {
      navigate(pendingTargetRef.current)
      pendingTargetRef.current = null
    }
  }, [navigate])

  const cancelNavigation = useCallback(() => {
    setIsModalOpen(false)
    if (isTanStackRouter()) {
      resetNavRef.current?.()
      proceedNavRef.current = null
      resetNavRef.current = null
    } else {
      pendingTargetRef.current = null
    }
  }, [])

  const handleSave = useCallback(async () => {
    const activeDirtyCheck = getActiveDirtyCheck()
    const activeSaveHandler = activeDirtyCheck?.saveAndExit ?? saveHandler

    if (!activeSaveHandler) return

    setIsSaving(true)
    const success = await activeSaveHandler()
    setIsSaving(false)

    if (success) {
      if (isBuilderDirty()) {
        setWorkflow(null)
        setEdges([])
      }
      proceedNavigation()
    } else {
      cancelNavigation()
    }
  }, [getActiveDirtyCheck, saveHandler, isBuilderDirty, setWorkflow, setEdges, proceedNavigation, cancelNavigation])

  const handleExitWithoutSaving = useCallback(() => {
    if (isBuilderDirty()) {
      setWorkflow(null)
      setEdges([])
    }
    for (const entry of dirtyChecksRef.current.values()) {
      entry.exitWithoutSaving?.()
    }
    proceedNavigation()
  }, [isBuilderDirty, setWorkflow, setEdges, proceedNavigation])

  const isOnBuilder = location.startsWith('/workflow-builder')
  const activeDirtyCheck = getActiveDirtyCheck()

  const modalTitle =
    activeDirtyCheck?.title ??
    (isOnBuilder ? 'Save changes before exiting the workflow builder?' : 'You have unsaved changes')
  const modalBody =
    activeDirtyCheck?.body ??
    (isOnBuilder
      ? 'Exiting now will permanently delete all recent unsaved progress on your workflow. Please save your work before leaving.'
      : 'Leaving now will discard your unsaved changes.')
  const saveLabel = activeDirtyCheck?.saveLabel ?? (isOnBuilder ? 'Save workflow' : 'Save changes')
  const hasSaveAction = !!(activeDirtyCheck?.saveAndExit ?? saveHandler)

  const contextValue = useMemo(
    () => ({ requestNavigation, registerSaveHandler, unregisterSaveHandler, registerDirtyCheck }),
    [requestNavigation, registerSaveHandler, unregisterSaveHandler, registerDirtyCheck]
  )

  return (
    <UnsavedChangesContext.Provider value={contextValue}>
      {isTanStackRouter() && (
        <TanStackNavigationBlocker onBlock={handleTanStackBlock} dirtyChecksRef={dirtyChecksRef} />
      )}
      {children}

      <Modal
        isOpen={isModalOpen}
        onClose={cancelNavigation}
        aria-labelledby="unsaved-changes-modal-title"
        aria-describedby="unsaved-changes-modal-body"
        variant="medium"
      >
        <ModalHeader title={modalTitle} titleIconVariant="warning" />
        <ModalBody id="unsaved-changes-modal-body">{modalBody}</ModalBody>
        <ModalFooter>
          {(hasSaveAction || isOnBuilder) && (
            <Button
              key="save"
              variant="primary"
              onClick={handleSave}
              isLoading={isSaving}
              isDisabled={isSaving || !hasSaveAction}
            >
              {saveLabel}
            </Button>
          )}
          <Button key="exit" variant="secondary" onClick={handleExitWithoutSaving} isDisabled={isSaving}>
            Exit without saving
          </Button>
          <Button key="cancel" variant="link" onClick={cancelNavigation} isDisabled={isSaving}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </UnsavedChangesContext.Provider>
  )
}
