import { useNavigate } from '@tanstack/react-router'
import { use, useMemo } from 'react'

import {
  UnsavedChangesContext,
  type UnsavedChangesContextType,
} from '../providers/unsaved-changes/unsavedChangesContext'
import { detachPromise } from '../utils/detachPromise'

const noop = () => () => {}

export function useUnsavedChanges(): UnsavedChangesContextType {
  const context = use(UnsavedChangesContext)
  const navigate = useNavigate()

  const fallback = useMemo<UnsavedChangesContextType>(
    () => ({
      requestNavigation: (path: string) => detachPromise(navigate({ to: path })),
      registerSaveHandler: noop,
      unregisterSaveHandler: () => {},
      registerDirtyCheck: noop,
    }),
    [navigate]
  )

  return context ?? fallback
}
