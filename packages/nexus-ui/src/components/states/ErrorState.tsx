import { EmptyState, EmptyStateBody } from '@patternfly/react-core'
import { RhUiErrorFillIcon } from '@patternfly/react-icons'

import { getErrorMessage, isServiceUnavailableError } from '../../utils/apiErrors'

import { EmptyStateServiceUnavailable } from './EmptyStateServiceUnavailable'

export function ErrorState(props: { title?: string; message: unknown }) {
  // Check for 503 Service Unavailable errors and show special empty state
  if (isServiceUnavailableError(props.message)) {
    return <EmptyStateServiceUnavailable description={getErrorMessage(props.message)} />
  }

  const title = props.title ?? 'Error'
  const message = getErrorMessage(props.message)

  return (
    <EmptyState data-testid="error-state" headingLevel="h2" titleText={title} icon={RhUiErrorFillIcon} isFullHeight>
      <EmptyStateBody>{message}</EmptyStateBody>
    </EmptyState>
  )
}
