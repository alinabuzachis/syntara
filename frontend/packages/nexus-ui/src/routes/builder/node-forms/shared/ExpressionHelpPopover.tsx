import { Stack, StackItem } from '@patternfly/react-core'

import { HelpPopover } from '../../../../components/expressions/HelpPopover'

type ExpressionHelpPopoverProps = {
  ariaLabel: string
  headerContent: string
  description: string
}

export function ExpressionHelpPopover({ ariaLabel, headerContent, description }: ExpressionHelpPopoverProps) {
  return (
    <HelpPopover
      ariaLabel={ariaLabel}
      headerContent={headerContent}
      bodyContent={
        <Stack hasGutter>
          <StackItem>{description}</StackItem>
          <StackItem>
            <strong>Visual expression builder:</strong> Build conditions visually using a form interface with dropdowns
            and inputs.
          </StackItem>
          <StackItem>
            <strong>Custom expression:</strong> Write conditions directly as template expressions in the format{' '}
            <code>{'${variable operator value}'}</code>
          </StackItem>
        </Stack>
      }
    />
  )
}
