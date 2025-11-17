import clsx from 'clsx'
import { AlertCircleIcon, CheckCircleIcon, InfoIcon, XCircleIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export type AlertVariant = 'success' | 'error' | 'warning' | 'info'

export interface AlertProps {
  variant?: AlertVariant
  title?: string
  message?: string
  description?: string // Alias for message
  dismissible?: boolean
  autoDismiss?: boolean
  autoDismissDelay?: number // in milliseconds
  onDismiss?: () => void
  className?: string
}

export interface AlertConfig extends Omit<AlertProps, 'onDismiss'> {
  id?: string
}

const variantConfig = {
  success: {
    icon: CheckCircleIcon,
    className: 'bg-white/5 backdrop-blur-md text-white',
    iconClassName: 'text-green-500',
  },
  error: {
    icon: XCircleIcon,
    className: 'bg-white/5 backdrop-blur-md text-white',
    iconClassName: 'text-red-500',
  },
  warning: {
    icon: AlertCircleIcon,
    className: 'bg-white/5 backdrop-blur-md text-white',
    iconClassName: 'text-yellow-500',
  },
  info: {
    icon: InfoIcon,
    className: 'bg-white/5 backdrop-blur-md text-white',
    iconClassName: 'text-blue-500',
  },
}

export function Alert({
  variant = 'info',
  title,
  message,
  description,
  dismissible = true,
  autoDismiss = false,
  autoDismissDelay = 5000,
  onDismiss,
  className,
}: AlertProps) {
  const [visible, setVisible] = useState(true)
  const config = variantConfig[variant]
  const Icon = config.icon
  const displayMessage = message || description || ''

  const handleDismiss = useCallback(() => {
    setVisible(false)
    onDismiss?.()
  }, [onDismiss])

  useEffect(() => {
    if (autoDismiss && visible) {
      const timer = setTimeout(() => {
        handleDismiss()
      }, autoDismissDelay)

      return () => clearTimeout(timer)
    }
  }, [autoDismiss, autoDismissDelay, visible, handleDismiss])

  if (!visible) return null

  return (
    <div
      className={clsx('flex items-start gap-3 rounded-2xl p-4 shadow-lg transition-all', config.className, className)}
      role="alert"
    >
      <Icon className={clsx('size-5 shrink-0', config.iconClassName)} />
      <div className="flex-1">
        {title && <div className="mb-1 font-semibold">{title}</div>}
        {displayMessage && <div className="text-sm">{displayMessage}</div>}
      </div>
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded p-1 transition-colors hover:bg-white/10"
          aria-label="Dismiss alert"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
