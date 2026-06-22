import { Button, Icon, Tooltip } from '@patternfly/react-core'
import { RhUiSaveFillIcon } from '@patternfly/react-icons'

import { formatDateTime } from '../../utils/dateUtils'

type SaveWorkflowButtonProps = Readonly<{
  isPending: boolean
  isDirty: boolean
  isNew: boolean
  lastSavedAt?: string | null
  onSave: () => void
  canEdit: boolean
  editTooltip: string
}>

export function SaveWorkflowButton({
  isPending,
  isDirty,
  isNew,
  lastSavedAt,
  onSave,
  canEdit,
  editTooltip,
}: SaveWorkflowButtonProps) {
  const isDisabledByState = isPending || (!isDirty && !isNew)

  let tooltipContent: string
  if (!canEdit) {
    tooltipContent = editTooltip
  } else if (lastSavedAt) {
    tooltipContent = `Last saved ${formatDateTime(lastSavedAt)}`
  } else {
    tooltipContent = 'Save workflow'
  }

  return (
    <Tooltip content={tooltipContent} position="bottom" enableFlip={false}>
      <Button
        variant="plain"
        onClick={canEdit ? onSave : undefined}
        isLoading={isPending}
        isAriaDisabled={!canEdit || isDisabledByState}
        icon={
          <Icon isInline>
            <RhUiSaveFillIcon />
          </Icon>
        }
        iconPosition="start"
      >
        {isPending ? 'Saving...' : 'Save'}
      </Button>
    </Tooltip>
  )
}
