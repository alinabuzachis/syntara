import { Button } from '@patternfly/react-core'

type ApprovalActionButtonsProps = Readonly<{
  isLoading?: boolean
  isDisabled?: boolean
  onReviewClick: () => void
}>

export function ApprovalActionButtons({ isLoading, isDisabled, onReviewClick }: ApprovalActionButtonsProps) {
  const disabled = isLoading || isDisabled
  return (
    <Button
      variant="primary"
      isLoading={isLoading}
      isAriaDisabled={disabled}
      onClick={disabled ? undefined : onReviewClick}
    >
      Review approval
    </Button>
  )
}
