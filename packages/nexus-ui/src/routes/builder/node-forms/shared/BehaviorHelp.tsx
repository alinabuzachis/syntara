import { List, ListItem, Popover, Stack, StackItem } from '@patternfly/react-core'
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons'

/**
 * Popover help icon explaining the behavior when max iterations is reached parameter.
 *
 * Used in Loop nodes (while type).
 */
export function BehaviorHelp() {
  return (
    <Popover
      aria-label="Behaviour when max iteration is reached help"
      headerContent="Behaviour when max iteration is reached"
      bodyContent={
        <Stack hasGutter>
          <StackItem>
            Choose what happens if the loop reaches its maximum iteration count before the exit condition is met.
          </StackItem>
          <StackItem>
            <strong>Options:</strong>
          </StackItem>
          <StackItem>
            <List>
              <ListItem>
                <strong>Continue to the done path:</strong> The loop stops gracefully, and the workflow continues along
                the normal "done" path (as if the exit condition was met). This is useful if hitting the max is
                acceptable and doesn't indicate a problem.
              </ListItem>
              <ListItem>
                <strong>Fail:</strong> The loop stops immediately and marks the workflow as failed. Use this when
                exceeding max iterations indicates something went wrong, such as an external system not responding as
                expected.
              </ListItem>
            </List>
          </StackItem>
          <StackItem>
            <strong>Recommendation:</strong> If the loop is polling for a condition that might not always be met (e.g.,
            waiting for user input), use "Continue." If the loop must complete its condition to proceed safely, use
            "Fail."
          </StackItem>
        </Stack>
      }
      triggerAction="click"
    >
      <button
        type="button"
        aria-label="Behaviour when max iteration is reached help"
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
