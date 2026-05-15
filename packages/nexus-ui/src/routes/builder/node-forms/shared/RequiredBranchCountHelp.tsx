import { Stack, StackItem } from '@patternfly/react-core'

import { HelpPopover } from '../../../../components/expressions/HelpPopover'

/**
 * Popover help icon explaining the required branch count parameter.
 *
 * Used in Converge step forms.
 */
export function RequiredBranchCountHelp() {
  return (
    <HelpPopover
      ariaLabel="Required branch count help"
      headerContent="Required number of branches"
      bodyContent={
        <Stack hasGutter>
          <StackItem>
            The minimum number of incoming branches that must complete before the workflow continues past this converge
            step.
          </StackItem>
          <StackItem>
            For example, if three parallel branches lead into this step and you set the required count to 2, the
            workflow will continue as soon as any two of the three branches finish.
          </StackItem>
        </Stack>
      }
    />
  )
}
