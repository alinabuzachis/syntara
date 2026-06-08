import { Button } from '@patternfly/react-core'

import { useCancelExecution } from './useCancelExecution'

type CancelExecutionButtonProps = Readonly<{
  executionId: string
}>

export function CancelExecutionButton({ executionId }: CancelExecutionButtonProps) {
  /* v8 ignore start -- v8 emits phantom branches from compiled hook destructuring */
  const cancel = useCancelExecution(executionId)
  /* v8 ignore stop */

  return (
    <Button variant="danger" onClick={cancel.handleCancel} isLoading={cancel.isPending} isDisabled={cancel.isPending}>
      Cancel execution
    </Button>
  )
}
