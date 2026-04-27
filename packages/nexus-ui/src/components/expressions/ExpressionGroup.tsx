/**
 * Group component for the expression builder
 * Renders a group of conditions/groups with logical operator (AND/OR)
 * Supports recursive nesting
 */

import {
  Button,
  Checkbox,
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  FormSelect,
  FormSelectOption,
  List,
  ListItem,
  Stack,
  StackItem,
  FormGroup,
  Tooltip,
} from '@patternfly/react-core'
import { PlusIcon, TrashIcon } from '@patternfly/react-icons'
import React from 'react'

import { createDefaultCondition, createDefaultGroup } from '../../utils/expressions/defaults'
import type {
  ExpressionGroup as ExpressionGroupType,
  ExpressionNode,
  LogicalOperator,
} from '../../utils/expressions/types'

import { ExpressionCondition } from './ExpressionCondition'
import { HelpPopover } from './HelpPopover'

const GroupHelp = () => (
  <HelpPopover
    ariaLabel="Group help"
    headerContent="Group"
    bodyContent={
      <Content component={ContentVariants.p}>
        A container for nested logic. Groups allow you to create complex "If/Then" scenarios, such as: (Condition A AND
        Condition B) OR (Condition C).
      </Content>
    }
  />
)

const RuleHelp = () => (
  <HelpPopover
    ariaLabel="Rule help"
    headerContent="Rule"
    bodyContent={
      <Content>
        <Content component={ContentVariants.p}>
          Define the relationship between your top-level conditions and groups.
        </Content>
        <List>
          <ListItem>
            <strong>AND:</strong> All conditions/groups must be true to proceed.
          </ListItem>
          <ListItem>
            <strong>OR:</strong> Only one condition/group needs to be true to proceed.
          </ListItem>
        </List>
      </Content>
    }
  />
)

const GroupRuleHelp = () => (
  <HelpPopover
    ariaLabel="Group rule help"
    headerContent="Group rule"
    bodyContent={
      <Content>
        <Content component={ContentVariants.p}>Determine the logic for this specific subset of conditions.</Content>
        <List>
          <ListItem>
            <strong>AND:</strong> Every condition inside this nested group must be true.
          </ListItem>
          <ListItem>
            <strong>OR:</strong> If any single condition inside this group is true, the entire group evaluates as true.
          </ListItem>
        </List>
      </Content>
    }
  />
)

const GroupNotHelp = () => (
  <HelpPopover
    ariaLabel="Group NOT operator help"
    headerContent="Not"
    bodyContent={
      <Content component={ContentVariants.p}>
        Inverse the logic of this entire group. When checked, the group evaluates as true only if all its conditions
        would normally evaluate as false.
      </Content>
    }
  />
)

type ExpressionGroupProps = {
  /** The group data */
  group: ExpressionGroupType
  /** Callback when group is updated */
  onChange: (updates: Partial<ExpressionGroupType>) => void
  /** Callback when a child node is updated */
  onUpdateChild: (index: number, node: ExpressionNode) => void
  /** Callback when a child node should be removed */
  onRemoveChild: (index: number) => void
  /** Callback when a condition should be added */
  onAddCondition: () => void
  /** Callback when a group should be added */
  onAddGroup: () => void
  /** Callback when group should be removed */
  onRemove?: () => void
  /** Nesting level (for styling) */
  level?: number
  /** Whether to show error state */
  error?: boolean
}

/**
 * Expression group component
 *
 * Renders:
 * - Group header with operator selector and add/remove buttons
 * - Children (conditions and nested groups)
 * - Add condition/group buttons
 */
export function ExpressionGroup(props: ExpressionGroupProps) {
  const {
    group,
    onChange,
    onUpdateChild,
    onRemoveChild,
    onAddCondition,
    onAddGroup,
    onRemove,
    level = 0,
    error,
  } = props

  const handleOperatorChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    onChange({ operator: value as LogicalOperator })
  }

  // Styling for visual hierarchy
  const containerStyle: React.CSSProperties = {
    border: '1px solid var(--pf-t--global--color--border--default)',
    borderRadius: 'var(--pf-t--global--border-radius--default)',
    padding: 'var(--pf-t--global--spacer--sm)',
    backgroundColor: level === 0 ? 'var(--pf-t--global--color--surface--primary)' : 'transparent',
    ...(level > 0 && {
      marginLeft: 'var(--pf-t--global--spacer--md)',
      borderLeft: '2px solid var(--pf-t--global--color--brand--default)',
    }),
  }

  return (
    <div style={containerStyle}>
      <Stack hasGutter>
        {/* NOT checkbox and Group label - only show for nested groups (level > 0) */}
        {level > 0 && (
          <>
            {/* NOT checkbox for group negation */}
            <StackItem>
              <Flex spaceItems={{ default: 'spaceItemsXs' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                  <Checkbox
                    id={`not-${group.id}`}
                    label="Not"
                    isChecked={group.negate ?? false}
                    onChange={(_event, checked) => onChange({ negate: checked })}
                    aria-label="Negate group"
                  />
                </FlexItem>
                <FlexItem>
                  <GroupNotHelp />
                </FlexItem>
              </Flex>
            </StackItem>

            {/* Group header with label and remove button */}
            <StackItem>
              <Flex
                alignItems={{ default: 'alignItemsCenter' }}
                justifyContent={{ default: 'justifyContentSpaceBetween' }}
              >
                <FlexItem>
                  <Flex spaceItems={{ default: 'spaceItemsXs' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>
                      <span style={{ fontWeight: 'var(--pf-t--global--font--weight--bold)' }}>Group</span>
                    </FlexItem>
                    <FlexItem>
                      <GroupHelp />
                    </FlexItem>
                  </Flex>
                </FlexItem>
                {onRemove && (
                  <FlexItem>
                    <Button
                      variant="plain"
                      isDanger
                      size="sm"
                      onClick={onRemove}
                      icon={<TrashIcon />}
                      aria-label="Remove group"
                    />
                  </FlexItem>
                )}
              </Flex>
            </StackItem>
          </>
        )}

        {/* Children with AND/OR selector between them */}
        {group.children.map((child, index) => (
          <React.Fragment key={child.id}>
            {/* Show AND/OR selector before each child except the first */}
            {index > 0 && (
              <StackItem>
                <div style={{ maxWidth: '100px' }}>
                  <FormGroup
                    label={
                      <span>
                        {level > 0 ? 'Group rule' : 'Rule'} {level > 0 ? <GroupRuleHelp /> : <RuleHelp />}
                      </span>
                    }
                    fieldId={`rule-${group.id}-${index}`}
                  >
                    {(() => {
                      const formSelect = (
                        <FormSelect
                          id={`rule-${group.id}-${index}`}
                          value={group.operator}
                          onChange={handleOperatorChange}
                          aria-label="Logical operator"
                          isDisabled={index > 1}
                        >
                          <FormSelectOption value="AND" label="AND" />
                          <FormSelectOption value="OR" label="OR" />
                        </FormSelect>
                      )

                      return index > 1 ? (
                        <Tooltip content="All conditions in this group must follow the same rule. To switch between AND/OR, please adjust the first rule input at the top of this level.">
                          {formSelect}
                        </Tooltip>
                      ) : (
                        formSelect
                      )
                    })()}
                  </FormGroup>
                </div>
              </StackItem>
            )}

            <StackItem>
              {child.type === 'condition' ? (
                <ExpressionCondition
                  condition={child}
                  onChange={(updates) => onUpdateChild(index, { ...child, ...updates })}
                  onRemove={group.children.length > 1 ? () => onRemoveChild(index) : undefined}
                  error={error}
                />
              ) : (
                <ExpressionGroup
                  group={child}
                  onChange={(updates) => onUpdateChild(index, { ...child, ...updates })}
                  onUpdateChild={(childIndex, node) => {
                    const updatedChildren = [...child.children]
                    updatedChildren[childIndex] = node
                    onUpdateChild(index, { ...child, children: updatedChildren })
                  }}
                  onRemoveChild={(childIndex) => {
                    const updatedChildren = child.children.filter((_, i) => i !== childIndex)
                    onUpdateChild(index, { ...child, children: updatedChildren })
                  }}
                  onAddCondition={() => {
                    const updatedChildren = [...child.children, createDefaultCondition()]
                    onUpdateChild(index, { ...child, children: updatedChildren })
                  }}
                  onAddGroup={() => {
                    const updatedChildren = [...child.children, createDefaultGroup()]
                    onUpdateChild(index, { ...child, children: updatedChildren })
                  }}
                  onRemove={group.children.length > 1 ? () => onRemoveChild(index) : undefined}
                  level={level + 1}
                  error={error}
                />
              )}
            </StackItem>
          </React.Fragment>
        ))}

        {/* Add buttons at bottom */}
        <StackItem>
          <Flex spaceItems={{ default: 'spaceItemsSm' }}>
            <FlexItem>
              <Tooltip content="Adds a single row for a new field/operator/value comparison within the current group.">
                <Button variant="secondary" size="sm" onClick={onAddCondition} icon={<PlusIcon />}>
                  Add condition
                </Button>
              </Tooltip>
            </FlexItem>
            <FlexItem>
              <Tooltip content='Creates a new nested logic container, allowing you to build multi-layered "And/Or" requirements.'>
                <Button variant="secondary" size="sm" onClick={onAddGroup} icon={<PlusIcon />}>
                  Add group
                </Button>
              </Tooltip>
            </FlexItem>
          </Flex>
        </StackItem>
      </Stack>
    </div>
  )
}
