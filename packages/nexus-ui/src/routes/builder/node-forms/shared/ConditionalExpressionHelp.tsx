import { Popover, Stack, StackItem } from '@patternfly/react-core'
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons'

/**
 * Popover help icon explaining conditional expression options:
 * - Visual builder mode
 * - Custom expression mode
 *
 * Used in Condition nodes and While loop nodes.
 */
export function ConditionalExpressionHelp() {
  return (
    <Popover
      aria-label="Conditional expression help"
      headerContent="Conditional expression"
      bodyContent={
        <Stack hasGutter>
          <StackItem>
            The condition that determines if the loop continues. The loop executes while this condition is true.
          </StackItem>
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
      triggerAction="click"
    >
      <button
        type="button"
        aria-label="Conditional expression help"
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
