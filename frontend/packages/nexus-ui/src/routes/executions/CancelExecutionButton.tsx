import { Button } from '@patternfly/react-core'

import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'
import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'

import { useCancelExecution } from './useCancelExecution'

type CancelExecutionButtonProps = Readonly<{
  executionId: string
}>

const cancelTooltip = permissionTooltip('cancel this execution', 'execution:run')

export function CancelExecutionButton({ executionId }: CancelExecutionButtonProps) {
  /* v8 ignore start -- v8 emits phantom branches from compiled hook destructuring */
  const cancel = useCancelExecution(executionId)
  const { allowed: canRun } = useCanI('run', 'execution')
  /* v8 ignore stop */

  return (
    <DisabledWithTooltip isDisabled={!canRun} content={cancelTooltip}>
      <Button
        variant="danger"
        onClick={cancel.handleCancel}
        isLoading={cancel.isPending}
        isAriaDisabled={!canRun || cancel.isPending}
      >
        Cancel execution
      </Button>
    </DisabledWithTooltip>
  )
}
