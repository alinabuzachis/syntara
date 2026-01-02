import { useEffect, useRef } from 'react'

import { useAlerts } from '../components/alerts'
import { getErrorMessage, getErrorStatus, getErrorTitle, isServiceUnavailableError } from '../utils/apiErrors'

export interface UseApiErrorAlertOptions {
  /** Override the alert title (defaults to parsed title or "Error") */
  title?: string
  /** Additional context prefixed to the parsed error message */
  context?: string
  /** If true, do not show an alert for 503 errors (useful when rendering a 503 EmptyState) */
  suppress503?: boolean
}

/**
 * Shows a deduped alert for an API error (including parsed 4xx/5xx response bodies).
 *
 * Intended for query/mutation error paths where the UI should always surface the backend message.
 */
export function useApiErrorAlert(error: unknown, options: UseApiErrorAlertOptions = {}) {
  const { showError, showWarning } = useAlerts()
  const lastKeyRef = useRef<string | null>(null)

  const title = options.title
  const context = options.context
  const suppress503 = options.suppress503

  useEffect(() => {
    if (!error) {
      lastKeyRef.current = null
      return
    }

    const message = getErrorMessage(error)
    const status = getErrorStatus(error)
    const errorTitle = title || getErrorTitle(error)
    const fullMessage = context ? `${context}: ${message}` : message
    const key = `${status ?? ''}::${errorTitle}::${fullMessage}`

    if (lastKeyRef.current === key) {
      return
    }
    lastKeyRef.current = key

    if (isServiceUnavailableError(error)) {
      if (!suppress503) {
        showWarning(errorTitle, fullMessage)
      }
      return
    }

    showError(errorTitle, fullMessage)
  }, [error, title, context, suppress503, showError, showWarning])
}
