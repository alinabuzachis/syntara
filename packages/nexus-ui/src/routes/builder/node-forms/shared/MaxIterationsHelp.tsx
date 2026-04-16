import { Stack, StackItem } from '@patternfly/react-core'

import { HelpPopover } from '../../../../components/expressions/HelpPopover'

/**
 * Popover help icon explaining the max iterations parameter for while loops.
 *
 * Used in Loop nodes (while type).
 */
export function MaxIterationsHelp() {
  return (
    <HelpPopover
      ariaLabel="Max iterations help"
      headerContent="Max iterations"
      bodyContent={
        <Stack hasGutter>
          <StackItem>Set a maximum number of times the loop can repeat.</StackItem>
          <StackItem>
            This acts as a safety net, preventing infinite loops if the exit condition is never met.
          </StackItem>
          <StackItem>
            <strong>Example use case:</strong> If polling an API endpoint for a status update (e.g., "check every 10
            seconds if job is done"), you might limit it to 100 iterations to avoid running endlessly if something goes
            wrong.
          </StackItem>
        </Stack>
      }
    />
  )
}
