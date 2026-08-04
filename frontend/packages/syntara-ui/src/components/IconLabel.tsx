import { Flex, FlexItem } from '@patternfly/react-core'
import type { ReactElement } from 'react'

/**
 * Inline icon + label for menus and compact actions.
 * Text is rendered as a direct child of FlexItem so it inherits `currentColor`
 * from the parent — including PF menu disabled/danger CSS variable overrides.
 * Avoid wrapping children in a PF `Content` component as it injects its own
 * color CSS variable and breaks inherited disabled/danger coloring.
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
      <FlexItem>{props.children}</FlexItem>
    </Flex>
  )
}
