import { Badge, Flex, FlexItem, Truncate } from '@patternfly/react-core'

/**
 * Renders a list of strings as badges in a flex wrap layout.
 * Used by the Workflows table for the Tags column.
 */
export function BadgesCell(props: { items: string[] }) {
  if (!props.items.length) {
    return null
  }
  return (
    <Flex flexWrap={{ default: 'wrap' }} gap={{ default: 'gapSm' }}>
      {props.items.map((item) => (
        <FlexItem key={item}>
          <Badge>
            <Truncate content={item} />
          </Badge>
        </FlexItem>
      ))}
    </Flex>
  )
}
