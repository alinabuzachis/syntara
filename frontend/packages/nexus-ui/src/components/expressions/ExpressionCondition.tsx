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
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  type MenuToggleElement,
  Select,
  SelectGroup,
  SelectList,
  SelectOption,
  TextInput,
  Button,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { RhUiTrashIcon } from '@patternfly/react-icons'
import { useCallback, useState } from 'react'

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
  /** Per-field error messages displayed inline under each field */
  fieldErrors?: { variable?: string; value?: string }
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
  const { condition, onChange, onRemove, error, fieldErrors } = props

  const [isOperatorOpen, setIsOperatorOpen] = useState(false)

  const handleOperatorSelect = useCallback(
    (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
      const newOp = String(value) as ComparisonOperator
      onChange({
        operator: newOp,
        ...(isUnaryOperator(newOp) && { value: '' }),
      })
      setIsOperatorOpen(false)
    },
    [onChange]
  )

  const operatorToggle = useCallback(
    (toggleRef: React.Ref<MenuToggleElement>) => (
      <MenuToggle
        ref={toggleRef}
        onClick={() => setIsOperatorOpen((prev) => !prev)}
        isExpanded={isOperatorOpen}
        isFullWidth
        aria-label="Comparison operator"
        id={`operator-${condition.id}`}
      >
        {OPERATOR_LABELS[condition.operator]}
      </MenuToggle>
    ),
    [isOperatorOpen, condition.operator, condition.id]
  )

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
              <RhUiTrashIcon />
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
              {fieldErrors?.variable && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">{fieldErrors.variable}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          </StackItem>

          {/* Operator */}
          <StackItem>
            <FormGroup label="Operator" labelHelp={<OperatorHelp />} isRequired fieldId={`operator-${condition.id}`}>
              <Select
                isOpen={isOperatorOpen}
                onSelect={handleOperatorSelect}
                onOpenChange={setIsOperatorOpen}
                toggle={operatorToggle}
                selected={condition.operator}
                maxMenuHeight="40vh"
                isScrollable
              >
                <SelectList aria-label="Comparison operator">
                  {OPERATOR_GROUPS.map((opGroup) => (
                    <SelectGroup key={opGroup.label} label={opGroup.label}>
                      {opGroup.operators.map((op) => (
                        <SelectOption key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </SelectOption>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectList>
              </Select>
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
                {fieldErrors?.value && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">{fieldErrors.value}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
            </StackItem>
          )}
        </Stack>
      </CardBody>
    </Card>
  )
}
