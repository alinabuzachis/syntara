import { createContext, useContext } from 'react'
import type { AlertConfig } from './Alert'

export interface AlertContextType {
  showAlert: (config: AlertConfig) => void
  showSuccess: (message: string, title?: string) => void
  showError: (message: string, title?: string) => void
  showWarning: (message: string, title?: string) => void
  showInfo: (message: string, title?: string) => void
  dismissAlert: (id: string) => void
  clearAllAlerts: () => void
}

export const AlertContext = createContext<AlertContextType | undefined>(undefined)

export function useAlerts() {
  const context = useContext(AlertContext)
  if (!context) {
    throw new Error('useAlerts must be used within an AlertProvider')
  }
  return context
}
