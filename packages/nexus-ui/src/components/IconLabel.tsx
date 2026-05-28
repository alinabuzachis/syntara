import { Content, ContentVariants, Flex, FlexItem } from '@patternfly/react-core'
import type { ReactElement } from 'react'

/**
 * Inline icon + label for menus and compact actions. Label text uses PF `Content`;
 * color is inherited from the wrapping `Flex` (including `isDanger` menu items).
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
        <Content component={ContentVariants.p} style={{ margin: 0 }}>
          {props.children}
        </Content>
      </FlexItem>
    </Flex>
  )
}
