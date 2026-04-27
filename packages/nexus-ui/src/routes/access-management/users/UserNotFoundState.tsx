import { Button, EmptyState, EmptyStateActions, EmptyStateBody, EmptyStateFooter } from '@patternfly/react-core'
import { RhUiArrowLeftIcon, RhUiSearchIcon, RhUiSyncIcon } from '@patternfly/react-icons'

type UserNotFoundStateProps = {
  onBack: () => void
  onRetry: () => void
}

export function UserNotFoundState({ onBack, onRetry }: Readonly<UserNotFoundStateProps>) {
  return (
    <EmptyState headingLevel="h2" titleText="User not found" icon={RhUiSearchIcon} isFullHeight>
      <EmptyStateBody>The user you are looking for does not exist or may have been deleted.</EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="primary" icon={<RhUiArrowLeftIcon />} onClick={onBack}>
            Back to users
          </Button>
          <Button variant="link" icon={<RhUiSyncIcon />} onClick={onRetry}>
            Retry
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  )
}
