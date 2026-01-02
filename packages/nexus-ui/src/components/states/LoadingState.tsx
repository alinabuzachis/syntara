import { Flex, FlexItem, Spinner } from '@patternfly/react-core'

export function LoadingState() {
  return (
    <Flex
      data-testid="loading-state"
      alignItems={{ default: 'alignItemsCenter' }}
      justifyContent={{ default: 'justifyContentCenter' }}
      style={{ height: '100%', minHeight: '200px' }}
    >
      <FlexItem>
        <Spinner size="xl" aria-label="Loading" />
      </FlexItem>
    </Flex>
  )
}
