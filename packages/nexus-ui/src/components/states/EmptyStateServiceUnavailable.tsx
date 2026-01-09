import { EmptyState, EmptyStateBody } from '@patternfly/react-core'
import { RhUiErrorFillIcon } from '@patternfly/react-icons'

export interface EmptyStateServiceUnavailableProps {
  title?: string
  description?: string
  showAdminHint?: boolean
}

/**
 * Display for 503 Service Unavailable errors.
 *
 * Use when POST /api/v1/invocations returns 503 because OPENROUTER_API_KEY
 * is not configured (backend PR #197).
 *
 * @example
 * if (error.error === 'service_unavailable') {
 *   return <EmptyStateServiceUnavailable description={error.message} />
 * }
 */
export function EmptyStateServiceUnavailable(props: Readonly<EmptyStateServiceUnavailableProps>) {
  const { title, description, showAdminHint = true } = props

  const defaultTitle = 'Service Unavailable'
  const defaultDescription = 'The AI service is currently unavailable. This may be a configuration issue.'
  const adminHint = 'If this persists, contact your system administrator.'

  const fullDescription = showAdminHint
    ? `${description ?? defaultDescription} ${adminHint}`
    : (description ?? defaultDescription)

  return (
    <EmptyState headingLevel="h2" titleText={title ?? defaultTitle} icon={RhUiErrorFillIcon} isFullHeight>
      <EmptyStateBody>{fullDescription}</EmptyStateBody>
    </EmptyState>
  )
}
