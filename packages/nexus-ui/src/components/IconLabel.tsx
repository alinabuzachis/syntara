import { Content, ContentVariants, Flex, FlexItem } from '@patternfly/react-core'
import type { ReactElement } from 'react'

/**
 * IconLabel component for displaying an icon with a label.
 * Commonly used in action menus, status indicators, and navigation items.
 *
 * @example
 * <IconLabel icon={<PencilAltIcon />}>Edit workflow</IconLabel>
 */
export function IconLabel(props: { icon?: ReactElement; children: React.ReactNode; color?: string }) {
  return (
    <Flex
      data-testid="icon-label"
      alignItems={{ default: 'alignItemsCenter' }}
      gap={{ default: 'gapSm' }}
      style={props.color ? { color: props.color } : undefined}
    >
      {props.icon && <FlexItem>{props.icon}</FlexItem>}
      <FlexItem>
        <Content component={ContentVariants.p}>{props.children}</Content>
      </FlexItem>
    </Flex>
  )
}
