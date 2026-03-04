import { Popover, Stack, StackItem } from '@patternfly/react-core'
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons'

/**
 * Popover help icon explaining the max iterations parameter for while loops.
 *
 * Used in Loop nodes (while type).
 */
export function MaxIterationsHelp() {
  return (
    <Popover
      aria-label="Max iterations help"
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
      triggerAction="click"
    >
      <button
        type="button"
        aria-label="Max iterations help"
        onClick={(e) => e.preventDefault()}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        <OutlinedQuestionCircleIcon style={{ color: 'var(--pf-t--global--color--icon--default)' }} />
      </button>
    </Popover>
  )
}
