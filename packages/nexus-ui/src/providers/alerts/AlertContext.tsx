import { createContext, useContext, type ReactNode } from 'react'

export type AlertVariant = 'success' | 'danger' | 'warning' | 'info' | 'custom'

export type AlertConfig = {
  /** Optional stable key for this toast; used with {@link AlertContextType.dismissAlert}. If omitted, an internal monotonic id is assigned. */
  id?: string
  variant?: AlertVariant | 'error' // Accept 'error' and map to 'danger'
  title: string
  description?: string | ReactNode
  autoDismiss?: boolean
  timeout?: number // milliseconds, defaults to 8000 if autoDismiss is true
}

export type AlertMessage = {
  title: string
  description?: string
}

export type AlertContextType = {
  showAlert: (config: AlertConfig) => void
  showSuccess: (options: AlertMessage) => void
  showError: (options: AlertMessage) => void
  showWarning: (options: AlertMessage) => void
  showInfo: (options: AlertMessage) => void
  dismissAlert: (instanceKey: string) => void
  clearAllAlerts: () => void
}

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
  return useContext(AlertContext)
}
