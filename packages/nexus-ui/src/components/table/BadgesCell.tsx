import { Flex, FlexItem, Label } from '@patternfly/react-core'

/**
 * Renders user-defined tag strings as compact outlined labels.
 * Used by the Workflows table Tags column (replaces incorrect `Badge` usage).
 */
export function BadgesCell(props: { items: string[] }) {
  if (!props.items.length) {
    return null
  }
  return (
    <Flex flexWrap={{ default: 'wrap' }} gap={{ default: 'gapSm' }}>
      {props.items.map((item) => (
        <FlexItem key={item}>
          <Label variant="outline" isCompact>
            {item}
          </Label>
        </FlexItem>
      ))}
    </Flex>
  )
}
