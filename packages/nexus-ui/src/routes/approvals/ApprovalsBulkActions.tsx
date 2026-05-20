import { Button, Content, ContentVariants, Flex, FlexItem, Tooltip } from '@patternfly/react-core'
import { RhUiDislikeIcon, RhUiLikeIcon } from '@patternfly/react-icons'

export type ApprovalsBulkActionsProps = {
  selectedCount: number
  onApprove: () => void
  onReject: () => void
  isDisabled?: boolean
}

export function ApprovalsBulkActions({
  selectedCount,
  onApprove,
  onReject,
  isDisabled = false,
}: Readonly<ApprovalsBulkActionsProps>) {
  const hasSelection = selectedCount > 0
  const disabled = isDisabled || !hasSelection

  // Determine tooltip content based on why buttons are disabled
  let tooltipContent: string | undefined
  if (!hasSelection) {
    tooltipContent = 'At least one approval needs to be selected to take action'
  }

  const approveButton = (
    <Button icon={<RhUiLikeIcon />} variant="secondary" isDisabled={disabled} onClick={onApprove}>
      Approve
    </Button>
  )

  const rejectButton = (
    <Button icon={<RhUiDislikeIcon />} variant="secondary" isDanger isDisabled={disabled} onClick={onReject}>
      Reject
    </Button>
  )

  return (
    <Flex gap={{ default: 'gapMd' }} alignItems={{ default: 'alignItemsCenter' }}>
      {hasSelection && (
        <FlexItem>
          <Content component={ContentVariants.p}>{selectedCount} selected</Content>
        </FlexItem>
      )}
      <FlexItem>
        {tooltipContent ? <Tooltip content={tooltipContent}>{approveButton}</Tooltip> : approveButton}
      </FlexItem>
      <FlexItem>{tooltipContent ? <Tooltip content={tooltipContent}>{rejectButton}</Tooltip> : rejectButton}</FlexItem>
    </Flex>
  )
}
