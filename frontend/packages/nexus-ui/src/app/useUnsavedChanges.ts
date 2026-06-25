import { useContext, useMemo } from 'react'

import { useNavigate } from '../hooks/routing/useNavigate'
import {
  UnsavedChangesContext,
  type UnsavedChangesContextType,
} from '../providers/unsaved-changes/unsavedChangesContext'

const noop = () => () => {}

export function useUnsavedChanges(): UnsavedChangesContextType {
  const context = useContext(UnsavedChangesContext)
  const navigate = useNavigate()

  const fallback = useMemo<UnsavedChangesContextType>(
    () => ({
      requestNavigation: (path: string) => navigate(path),
      registerSaveHandler: noop,
      unregisterSaveHandler: () => {},
      registerDirtyCheck: noop,
    }),
    [navigate]
  )

  return context ?? fallback
}
