import { Alert, AlertActionCloseButton, AlertGroup } from '@patternfly/react-core'
import { useState, useCallback, type ReactNode } from 'react'

import { AlertContext, type AlertConfig, type AlertVariant } from './AlertContext'

interface AlertItem extends Omit<AlertConfig, 'variant'> {
  id: string
  variant: AlertVariant
}

const DEFAULT_TIMEOUT = 8000

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])

  const showAlert = useCallback((config: AlertConfig) => {
    const id = config.id || `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Map 'error' to 'danger' for PatternFly compatibility
    let variant: AlertVariant = (config.variant as AlertVariant) || 'info'
    if (config.variant === 'error') {
      variant = 'danger'
    }

    const newAlert: AlertItem = {
      ...config,
      id,
      variant,
    }

    setAlerts((prev) => [...prev, newAlert])
  }, [])

  const showSuccess = useCallback(
    (title: string, description?: string) => {
      showAlert({ variant: 'success', title, description, autoDismiss: true })
    },
    [showAlert]
  )

  const showError = useCallback(
    (title: string, description?: string) => {
      showAlert({ variant: 'danger', title, description, autoDismiss: true })
    },
    [showAlert]
  )

  const showWarning = useCallback(
    (title: string, description?: string) => {
      showAlert({ variant: 'warning', title, description, autoDismiss: true })
    },
    [showAlert]
  )

  const showInfo = useCallback(
    (title: string, description?: string) => {
      showAlert({ variant: 'info', title, description, autoDismiss: true })
    },
    [showAlert]
  )

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id))
  }, [])

  const clearAllAlerts = useCallback(() => {
    setAlerts([])
  }, [])

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
      <AlertGroup isToast isLiveRegion hasAnimations>
        {alerts.map((alert) => (
          <Alert
            key={alert.id}
            variant={alert.variant}
            title={alert.title}
            timeout={alert.autoDismiss ? (alert.timeout ?? DEFAULT_TIMEOUT) : undefined}
            onTimeout={() => dismissAlert(alert.id)}
            actionClose={<AlertActionCloseButton onClose={() => dismissAlert(alert.id)} />}
          >
            {alert.description}
          </Alert>
        ))}
      </AlertGroup>
    </AlertContext.Provider>
  )
}
