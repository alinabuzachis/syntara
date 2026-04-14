import { Button, EmptyState, EmptyStateActions, EmptyStateBody, EmptyStateFooter } from '@patternfly/react-core'
import { RhUiArrowLeftIcon, RhUiSearchIcon, RhUiSyncIcon } from '@patternfly/react-icons'

interface GroupNotFoundStateProps {
  onBack: () => void
  onRetry: () => void
}

export function GroupNotFoundState({ onBack, onRetry }: Readonly<GroupNotFoundStateProps>) {
  return (
    <EmptyState headingLevel="h2" titleText="Group not found" icon={RhUiSearchIcon} isFullHeight>
      <EmptyStateBody>The group you are looking for does not exist or may have been deleted.</EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="primary" icon={<RhUiArrowLeftIcon />} onClick={onBack}>
            Back to groups
          </Button>
          <Button variant="link" icon={<RhUiSyncIcon />} onClick={onRetry}>
            Retry
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  )
}
