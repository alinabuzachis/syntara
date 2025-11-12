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

// Create a default no-op implementation for safety during initialization
const noopAlertContext: AlertContextType = {
  showAlert: () => {},
  showSuccess: () => {},
  showError: () => {},
  showWarning: () => {},
  showInfo: () => {},
  dismissAlert: () => {},
  clearAllAlerts: () => {},
}

export const AlertContext = createContext<AlertContextType>(noopAlertContext)

export function useAlerts() {
  const context = useContext(AlertContext)
  return context
}
