import { Popover } from '@patternfly/react-core'
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
        <div>
          <p>
            <strong>Visual expression builder:</strong> Build conditions visually using a form interface with dropdowns
            and inputs.
          </p>
          <p style={{ marginTop: '8px' }}>
            <strong>Custom expression:</strong> Write conditions directly as template expressions in the format{' '}
            <code>{'${variable operator value}'}</code>
          </p>
        </div>
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
