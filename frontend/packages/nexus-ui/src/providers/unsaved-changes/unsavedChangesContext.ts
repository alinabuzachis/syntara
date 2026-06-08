import { createContext } from 'react'

export type UnsavedChangesContextType = {
  /**
   * Request navigation to a path. If there are unsaved changes in the builder,
   * shows a confirmation modal. Otherwise, navigates immediately.
   */
  requestNavigation: (targetPath: string) => void
  /**
   * Register the save handler from BuilderContent
   */
  registerSaveHandler: (handler: () => Promise<boolean>) => void
  /**
   * Unregister the save handler when BuilderContent unmounts
   */
  unregisterSaveHandler: () => void
}

export const UnsavedChangesContext = createContext<UnsavedChangesContextType | null>(null)
