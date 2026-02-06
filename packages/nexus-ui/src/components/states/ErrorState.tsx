import { Button, EmptyState, EmptyStateActions, EmptyStateBody } from '@patternfly/react-core'
import { RhUiErrorFillIcon } from '@patternfly/react-icons'

import { getErrorMessage, getErrorTitle, isRetryableError, isServiceUnavailableError } from '../../utils/apiErrors'

import { EmptyStateServiceUnavailable } from './EmptyStateServiceUnavailable'

export interface ErrorStateProps {
  title?: string
  message: unknown
  onRetry?: () => void
}

export function ErrorState(props: ErrorStateProps) {
  const { title, message, onRetry } = props

  // Check for 503 Service Unavailable errors and show special empty state
  if (isServiceUnavailableError(message)) {
    return <EmptyStateServiceUnavailable description={getErrorMessage(message)} />
  }

  const errorTitle = title ?? getErrorTitle(message)
  const errorMessage = getErrorMessage(message)
  const retryable = isRetryableError(message)

  return (
    <EmptyState
      data-testid="error-state"
      headingLevel="h2"
      titleText={errorTitle}
      icon={RhUiErrorFillIcon}
      isFullHeight
    >
      <EmptyStateBody>{errorMessage}</EmptyStateBody>
      {retryable && onRetry && (
        <EmptyStateActions>
          <Button variant="primary" onClick={onRetry}>
            Retry
          </Button>
        </EmptyStateActions>
      )}
    </EmptyState>
  )
}
