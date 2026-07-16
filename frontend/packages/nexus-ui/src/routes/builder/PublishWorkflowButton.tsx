import { Button, Icon } from '@patternfly/react-core'
import { RhUiPublishIcon } from '@patternfly/react-icons'

import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'

type PublishWorkflowButtonProps = Readonly<{
  canEdit: boolean
  hasNoSteps: boolean
  hasNoChanges: boolean
  validationErrorCount: number
  isVerifying: boolean
  editTooltip: string
  handleVerify: (onValid?: () => void) => void
  onPublishClick: () => void
}>

export function PublishWorkflowButton({
  canEdit,
  hasNoSteps,
  hasNoChanges,
  validationErrorCount,
  isVerifying,
  editTooltip,
  handleVerify,
  onPublishClick,
}: PublishWorkflowButtonProps) {
  const hasErrors = validationErrorCount > 0
  const canPublish = canEdit && !hasNoSteps && !hasErrors && !isVerifying && !hasNoChanges
  const errorSuffix = validationErrorCount === 1 ? '' : 's'

  let tooltipContent = editTooltip
  if (canEdit && hasNoChanges) {
    tooltipContent = 'No changes to publish'
  } else if (canEdit && hasNoSteps) {
    tooltipContent = 'Complete your workflow before publishing'
  } else if (canEdit && isVerifying) {
    tooltipContent = 'Verifying workflow...'
  } else if (canEdit && hasErrors) {
    tooltipContent = `Verify your workflow before publishing — ${validationErrorCount} error${errorSuffix} found`
  }

  return (
    <DisabledWithTooltip isDisabled={!canPublish} content={tooltipContent}>
      <Button
        variant="primary"
        isAriaDisabled={!canPublish}
        onClick={canPublish ? () => handleVerify(() => onPublishClick()) : undefined}
        icon={
          <Icon isInline>
            <RhUiPublishIcon />
          </Icon>
        }
        iconPosition="start"
      >
        Publish workflow
      </Button>
    </DisabledWithTooltip>
  )
}
