import { Badge, Flex, FlexItem, Truncate } from '@patternfly/react-core'

export function LabelsCell(props: { labels?: Record<string, string> | null }) {
  if (!props.labels) {
    return null
  }
  return (
    <Flex flexWrap={{ default: 'wrap' }} gap={{ default: 'gapSm' }}>
      {Object.entries(props.labels).map(([key, value]) => (
        <FlexItem key={key}>
          <Badge>
            <Truncate content={`${key}=${value}`} />
          </Badge>
        </FlexItem>
      ))}
    </Flex>
  )
}
