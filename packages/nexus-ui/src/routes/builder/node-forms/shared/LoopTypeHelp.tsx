import { List, ListItem, Popover, Stack, StackItem } from '@patternfly/react-core'
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons'

/**
 * Popover help icon explaining the loop type parameter.
 *
 * Used in Loop nodes.
 */
export function LoopTypeHelp() {
  return (
    <Popover
      aria-label="Loop type help"
      headerContent="Loop type"
      bodyContent={
        <Stack hasGutter>
          <StackItem>Determine how the automation should repeat the tasks contained within this node.</StackItem>
          <StackItem>
            <strong>Options:</strong>
          </StackItem>
          <StackItem>
            <List>
              <ListItem>
                <strong>For each:</strong> Best for processing lists. The loop will iterate once for every item in a
                collection (e.g., every "user" in a list of customers).
              </ListItem>
              <ListItem>
                <strong>While:</strong> Best for repetitive checks. The loop will continue to run as long as a specific
                condition remains true (ex: "repeat while the server is busy").
              </ListItem>
            </List>
          </StackItem>
          <StackItem>
            <strong>Static vs. dynamic:</strong> Use for each when you have a fixed set of data from a previous node.
            Use while when you are waiting for an external change or a specific state to be reached.
          </StackItem>
        </Stack>
      }
      triggerAction="click"
    >
      <button
        type="button"
        aria-label="Loop type help"
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
