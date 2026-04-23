import {
  Alert,
  AlertActionCloseButton,
  Button,
  Content,
  ContentVariants,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { useState } from 'react'

interface ConnectionBannerProps {
  isVisible: boolean
}

const defaultRefresh = () => {
  window.location.reload()
}

export function ConnectionBanner({ isVisible }: ConnectionBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false)
  if (!isVisible || isDismissed) {
    return null
  }

  const handleRefresh = () => {
    defaultRefresh()
  }

  const handleClose = () => {
    setIsDismissed(true)
  }

  return (
    <Alert
      isInline
      variant="warning"
      title="Live updates paused"
      actionClose={<AlertActionCloseButton onClose={handleClose} />}
    >
      <Stack hasGutter>
        <StackItem>
          <Content component={ContentVariants.p}>
            Your workflow is still running safely in the background. Refresh the page to see the latest progress.
          </Content>
        </StackItem>
        <StackItem>
          <Button variant="link" isInline onClick={handleRefresh}>
            Refresh
          </Button>
        </StackItem>
      </Stack>
    </Alert>
  )
}
