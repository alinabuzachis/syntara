import { Button } from '@patternfly/react-core'

type ApprovalActionButtonsProps = Readonly<{
  isLoading?: boolean
  onReviewClick: () => void
}>

export function ApprovalActionButtons({ isLoading, onReviewClick }: ApprovalActionButtonsProps) {
  return (
    <Button variant="primary" isLoading={isLoading} isDisabled={isLoading} onClick={onReviewClick}>
      Review approval
    </Button>
  )
}
