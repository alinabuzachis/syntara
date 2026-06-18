import { Button, Flex, FlexItem, Icon, Title, TitleSizes } from '@patternfly/react-core'
import { RhUiCloseIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'

type SidePanelHeaderProps = Readonly<{
  /** The title text displayed in the panel header. */
  title: string
  /** Called when the close button is clicked. */
  onClose: () => void
  /** Accessible label for the close button. Defaults to `"Close"`. */
  closeAriaLabel?: string
  /** Optional icon rendered before the title. */
  icon?: ReactNode
}>

/**
 * Reusable header row for side panels: title (with optional icon) on the left,
 * close button on the right. Used by `ApprovalSidePanel`, `WorkflowHistoryCard`, etc.
 */
export function SidePanelHeader({ title, onClose, closeAriaLabel = 'Close', icon }: SidePanelHeaderProps) {
  return (
    <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsFlexStart' }}>
      <FlexItem>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
          {icon && <FlexItem>{icon}</FlexItem>}
          <FlexItem>
            <Title headingLevel="h2" size={TitleSizes.md}>
              {title}
            </Title>
          </FlexItem>
        </Flex>
      </FlexItem>
      <FlexItem>
        <Button variant="plain" onClick={onClose} aria-label={closeAriaLabel}>
          <Icon>
            <RhUiCloseIcon />
          </Icon>
        </Button>
      </FlexItem>
    </Flex>
  )
}
