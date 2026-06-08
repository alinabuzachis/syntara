import { useContext } from 'react'

import { UnsavedChangesContext } from '../providers/unsaved-changes/unsavedChangesContext'

export function useUnsavedChanges() {
  const context = useContext(UnsavedChangesContext)
  if (!context) {
    throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider')
  }
  return context
}
