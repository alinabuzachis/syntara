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

import type { ExpressionCondition as ExpressionConditionType, ComparisonOperator } from '../../utils/expressions/types'

import { HelpPopover } from './HelpPopover'

const COMPARISON_OPERATORS: ComparisonOperator[] = ['==', '!=', '>', '<', '>=', '<=']

const OPERATOR_LABELS: Record<ComparisonOperator, string> = {
  '==': '==   equal to',
  '!=': '!=   not equal to',
  '>': '>   greater than',
  '<': '<   less than',
  '>=': '>=   greater than or equal to',
  '<=': '<=   less than or equal to',
}

const FieldHelp = () => (
  <HelpPopover
    ariaLabel="Field help"
    headerContent="Field"
    bodyContent={
      <div>
        The data point you want to evaluate. You can type a value manually or drag and drop a variable (like a status
        code, ID, or name) from a previous node's output.
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
        The logical test to apply to your field. Common options include "Equals," "Contains," "Is greater than," or "Is
        empty."
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

interface ExpressionConditionProps {
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
 * - Operator select (==, !=, >, <, >=, <=)
 * - Value input (e.g., "18")
 * - Remove button (if onRemove provided)
 */
export function ExpressionCondition(props: ExpressionConditionProps) {
  const { condition, onChange, onRemove, error } = props

  return (
    <Card style={{ borderRadius: '16px' }}>
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
                  isChecked={condition.negate || false}
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
                onChange={(_event, value) => onChange({ operator: value as ComparisonOperator })}
                style={{ fontFamily: 'monospace' }}
              >
                {COMPARISON_OPERATORS.map((op) => (
                  <FormSelectOption key={op} value={op} label={OPERATOR_LABELS[op]} />
                ))}
              </FormSelect>
            </FormGroup>
          </StackItem>

          {/* Value */}
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
        </Stack>
      </CardBody>
    </Card>
  )
}
