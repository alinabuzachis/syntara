import { AlertCircleIcon, CheckCircleIcon, InfoIcon, XCircleIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'

export type AlertVariant = 'success' | 'error' | 'warning' | 'info'

export interface AlertProps {
  variant?: AlertVariant
  title?: string
  message: string
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
    className: 'border-green-500/60 bg-green-500/30 text-green-50',
    iconClassName: 'text-green-300',
  },
  error: {
    icon: XCircleIcon,
    className: 'border-red-500/60 bg-red-500/30 text-red-50',
    iconClassName: 'text-red-300',
  },
  warning: {
    icon: AlertCircleIcon,
    className: 'border-yellow-500/60 bg-yellow-500/30 text-yellow-50',
    iconClassName: 'text-yellow-300',
  },
  info: {
    icon: InfoIcon,
    className: 'border-blue-500/60 bg-blue-500/30 text-blue-50',
    iconClassName: 'text-blue-300',
  },
}

export function Alert({
  variant = 'info',
  title,
  message,
  dismissible = true,
  autoDismiss = false,
  autoDismissDelay = 5000,
  onDismiss,
  className,
}: AlertProps) {
  const [visible, setVisible] = useState(true)
  const config = variantConfig[variant]
  const Icon = config.icon

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
      className={clsx(
        'flex items-start gap-3 rounded-lg border-2 p-4 shadow-lg transition-all',
        config.className,
        className
      )}
      role="alert"
    >
      <Icon className={clsx('size-5 shrink-0', config.iconClassName)} />
      <div className="flex-1">
        {title && <div className="mb-1 font-semibold">{title}</div>}
        <div className="text-sm">{message}</div>
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
