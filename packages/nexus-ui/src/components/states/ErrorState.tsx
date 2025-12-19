import { EmptyStateServiceUnavailable } from '@ansible/nexus-ui-framework'

import { getErrorMessage, isServiceUnavailableError } from '../../utils/apiErrors'

export function ErrorState(props: { title?: string; message: unknown }) {
  // Check for 503 Service Unavailable errors and show special empty state
  if (isServiceUnavailableError(props.message)) {
    return <EmptyStateServiceUnavailable description={getErrorMessage(props.message)} />
  }

  return (
    <div data-testid="error-state" className="flex h-full w-full items-center justify-center">
      <div className="glass rounded-2xl border px-6 py-4">
        {props.title && <div className="mb-2 text-lg font-bold">{props.title}</div>}
        <div className="text-red-400">{getErrorMessage(props.message)}</div>
      </div>
    </div>
  )
}
