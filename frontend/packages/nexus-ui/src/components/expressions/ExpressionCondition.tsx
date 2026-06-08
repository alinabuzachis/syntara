/**
 * Individual condition component for the expression builder
 * Renders a single condition row with variable, operator, value inputs
 */

import {
  Card,
  CardBody,
  Checkbox,
  Flex,
  FlexItem,
  FormGroup,
  FormSelect,
  FormSelectOption,
  TextInput,
  Button,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { TrashIcon } from '@patternfly/react-icons'

import { isUnaryOperator, OPERATOR_LABELS, OPERATOR_GROUPS } from '../../utils/expressions/defaults'
import type { ExpressionCondition as ExpressionConditionType, ComparisonOperator } from '../../utils/expressions/types'

import { HelpPopover } from './HelpPopover'

const FieldHelp = () => (
  <HelpPopover
    ariaLabel="Field help"
    headerContent="Field"
    bodyContent={
      <div>
        The data point you want to evaluate. You can type a value manually or drag and drop a variable (like a status
        code, ID, or name) from a previous step's output.
      </div>
    }
  />
)

const OperatorHelp = () => (
  <HelpPopover
    ariaLabel="Operator help"
    headerContent="Operator"
    bodyContent={
      <div>
        The logical test to apply to your field. Common options include "is equal to," "contains," "is greater than," or
        "is empty."
      </div>
    }
  />
)

const ValueHelp = () => (
  <HelpPopover
    ariaLabel="Value help"
    headerContent="Value"
    bodyContent={
      <div>
        The specific criteria you are testing against. This is what the "Field" will be compared to using your chosen
        "Operator."
      </div>
    }
  />
)

const NotHelp = () => (
  <HelpPopover
    ariaLabel="NOT operator help"
    headerContent="Not"
    bodyContent={
      <div>
        Inverse the logic of this specific condition. When checked, the condition will evaluate as true only if the
        specified criteria are not met.
      </div>
    }
  />
)

type ExpressionConditionProps = {
  /** The condition data */
  condition: ExpressionConditionType
  /** Callback when condition is updated */
  onChange: (updates: Partial<ExpressionConditionType>) => void
  /** Callback when condition should be removed */
  onRemove?: () => void
  /** Whether to show error state */
  error?: boolean
}

/**
 * Individual condition row component
 *
 * Renders inputs for:
 * - NOT checkbox (optional negation) - in separate row
 * - Variable input (e.g., "input.age")
 * - Operator select (unified list)
 * - Value input (e.g., "18") - hidden for unary operators (exists, isEmpty, etc.)
 * - Remove button (if onRemove provided)
 */
export function ExpressionCondition(props: ExpressionConditionProps) {
  const { condition, onChange, onRemove, error } = props

  // Handle operator change
  const handleOperatorChange = (_event: unknown, value: string) => {
    const newOp = value as ComparisonOperator
    // Clear value when switching to unary operator (exists, isEmpty don't need values)
    onChange({
      operator: newOp,
      ...(isUnaryOperator(newOp) && { value: '' }),
    })
  }

  return (
    <Card style={{ borderRadius: 'var(--pf-t--global--border-radius--pill)' }}>
      <CardBody style={{ position: 'relative' }}>
        {/* Remove button - positioned at top right */}
        {onRemove && (
          <div
            style={{
              position: 'absolute',
              top: 'var(--pf-t--global--spacer--sm)',
              right: 'var(--pf-t--global--spacer--sm)',
            }}
          >
            <Button variant="plain" isDanger onClick={onRemove} aria-label="Remove condition">
              <TrashIcon />
            </Button>
          </div>
        )}

        <Stack hasGutter>
          {/* NOT checkbox at top */}
          <StackItem>
            <Flex spaceItems={{ default: 'spaceItemsXs' }} alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>
                <Checkbox
                  id={`not-${condition.id}`}
                  label="Not"
                  isChecked={condition.negate ?? false}
                  onChange={(_event, checked) => onChange({ negate: checked })}
                  aria-label="Negate condition"
                />
              </FlexItem>
              <FlexItem>
                <NotHelp />
              </FlexItem>
            </Flex>
          </StackItem>

          {/* Field */}
          <StackItem>
            <FormGroup label="Field" labelHelp={<FieldHelp />} isRequired fieldId={`field-${condition.id}`}>
              <TextInput
                id={`field-${condition.id}`}
                value={condition.variable}
                onChange={(_event, value) => onChange({ variable: value })}
                placeholder="Enter or drag and drop value"
                style={{ fontFamily: 'monospace', fontSize: 'var(--pf-t--global--font--size--body--sm)' }}
                validated={error && !condition.variable.trim() ? 'error' : 'default'}
              />
            </FormGroup>
          </StackItem>

          {/* Operator */}
          <StackItem>
            <FormGroup label="Operator" labelHelp={<OperatorHelp />} isRequired fieldId={`operator-${condition.id}`}>
              <FormSelect
                id={`operator-${condition.id}`}
                value={condition.operator}
                onChange={handleOperatorChange}
                aria-label="Comparison operator"
              >
                {OPERATOR_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.operators.map((op) => (
                      <FormSelectOption key={op} value={op} label={OPERATOR_LABELS[op]} />
                    ))}
                  </optgroup>
                ))}
              </FormSelect>
            </FormGroup>
          </StackItem>

          {/* Value (only for binary operators) */}
          {!isUnaryOperator(condition.operator) && (
            <StackItem>
              <FormGroup label="Value" labelHelp={<ValueHelp />} isRequired fieldId={`value-${condition.id}`}>
                <TextInput
                  id={`value-${condition.id}`}
                  value={condition.value}
                  onChange={(_event, value) => onChange({ value })}
                  placeholder="Enter or drag and drop value"
                  style={{ fontFamily: 'monospace', fontSize: 'var(--pf-t--global--font--size--body--sm)' }}
                  validated={error && !condition.value.trim() ? 'error' : 'default'}
                />
              </FormGroup>
            </StackItem>
          )}
        </Stack>
      </CardBody>
    </Card>
  )
}
