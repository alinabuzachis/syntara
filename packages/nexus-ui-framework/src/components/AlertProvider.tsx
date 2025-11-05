import { useState, type ReactNode } from 'react'
import { Alert, type AlertConfig } from './Alert'
import { AlertContext } from './AlertContext'

interface AlertItem extends AlertConfig {
  id: string
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])

  const showAlert = (config: AlertConfig) => {
    const id = config.id || `alert-${Date.now()}-${Math.random()}`
    const newAlert: AlertItem = { ...config, id }
    setAlerts((prev) => [...prev, newAlert])
  }

  const showSuccess = (message: string, title?: string) => {
    showAlert({ variant: 'success', message, title, autoDismiss: true })
  }

  const showError = (message: string, title?: string) => {
    showAlert({ variant: 'error', message, title, autoDismiss: false })
  }

  const showWarning = (message: string, title?: string) => {
    showAlert({ variant: 'warning', message, title, autoDismiss: true })
  }

  const showInfo = (message: string, title?: string) => {
    showAlert({ variant: 'info', message, title, autoDismiss: true })
  }

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id))
  }

  const clearAllAlerts = () => {
    setAlerts([])
  }

  return (
    <AlertContext.Provider
      value={{
        showAlert,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        dismissAlert,
        clearAllAlerts,
      }}
    >
      {children}

      {/* Alert Container */}
      <div className="pointer-events-none fixed top-4 right-4 z-50 flex max-w-md flex-col gap-2">
        {alerts.map((alert) => (
          <div key={alert.id} className="animate-slide-in-right pointer-events-auto">
            <Alert {...alert} onDismiss={() => dismissAlert(alert.id)} />
          </div>
        ))}
      </div>
    </AlertContext.Provider>
  )
}
