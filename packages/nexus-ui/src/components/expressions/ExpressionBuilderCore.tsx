/**
 * Core expression builder component with state management
 * Uses useReducer for managing nested expression tree
 */

import { FormSelect, FormSelectOption, Stack, StackItem } from '@patternfly/react-core'
import { useReducer, useEffect, useRef } from 'react'

import { createDefaultGroup, createDefaultCondition } from '../../utils/expressions/defaults'
import { parseExpression } from '../../utils/expressions/parser'
import { serializeExpression } from '../../utils/expressions/serializer'
import type { Expression, ExpressionNode, ExpressionGroup as ExpressionGroupType } from '../../utils/expressions/types'

import { ExpressionGroup } from './ExpressionGroup'
import { ExpressionRawEditor } from './ExpressionRawEditor'

interface ExpressionBuilderCoreProps {
  /** Current expression value (template string) */
  value: string
  /** Callback when expression changes */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Whether to show error state */
  error?: boolean
  /** ID for the component (for label association) */
  id?: string
  /** aria-labelledby for accessibility */
  'aria-labelledby'?: string
}

type EditorMode = 'visual' | 'raw'

interface BuilderState {
  expression: Expression

  mode: EditorMode
  rawValue: string
}

type BuilderAction =
  | { type: 'SET_EXPRESSION'; payload: Expression }
  | { type: 'SET_RAW_VALUE'; payload: string }
  | { type: 'TOGGLE_MODE' }
  | { type: 'UPDATE_ROOT'; payload: ExpressionNode | null }

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'SET_EXPRESSION':
      return {
        ...state,
        expression: action.payload,
        rawValue: serializeExpression(action.payload),
      }

    case 'SET_RAW_VALUE':
      return {
        ...state,
        rawValue: action.payload,
      }

    case 'TOGGLE_MODE': {
      if (state.mode === 'visual') {
        // Switching to raw mode
        return {
          ...state,
          mode: 'raw',
          rawValue: serializeExpression(state.expression),
        }
      } else {
        // Switching to visual mode
        const parsed = parseExpression(state.rawValue)
        // Allow switching to visual mode even if parsing fails (empty or invalid)
        // Show default empty group if no valid expression
        return {
          ...state,
          mode: 'visual',
          expression: parsed.root ? parsed : { root: createDefaultGroup() },
        }
      }
    }

    case 'UPDATE_ROOT':
      return {
        ...state,
        expression: { root: action.payload },
      }

    default:
      return state
  }
}

/**
 * Expression builder core component
 *
 * Manages the expression tree state and provides visual/raw mode toggle
 * Follows the DateRangeCadencePicker pattern for external sync
 */
export function ExpressionBuilderCore(props: ExpressionBuilderCoreProps) {
  const { value, onChange, error, placeholder, id, 'aria-labelledby': ariaLabelledBy } = props

  // Initialize state by parsing the value (lazy init avoids re-parsing on every render)
  const [state, dispatch] = useReducer(builderReducer, value, (initialValue): BuilderState => {
    const initialExpression = parseExpression(initialValue)
    const initialMode: EditorMode = initialExpression.root ? 'visual' : initialValue ? 'raw' : 'visual'

    return {
      expression: initialExpression.root ? initialExpression : { root: createDefaultGroup() },
      mode: initialMode,
      rawValue: initialValue,
    }
  })

  // Track previous values to detect external changes
  const prevValueRef = useRef(value)
  const lastEmittedRef = useRef<string | undefined>(undefined)

  // Update local state when value prop changes from external source
  useEffect(() => {
    if (value !== prevValueRef.current && value !== lastEmittedRef.current) {
      const parsed = parseExpression(value)
      if (parsed.root) {
        // Valid expression - update both expression and rawValue
        dispatch({ type: 'SET_EXPRESSION', payload: parsed })
      } else {
        // Invalid expression - preserve raw value, use fallback for visual mode
        dispatch({ type: 'SET_EXPRESSION', payload: { root: createDefaultGroup() } })
        dispatch({ type: 'SET_RAW_VALUE', payload: value })
      }
    }
    prevValueRef.current = value
  }, [value])

  // Emit changes to parent
  useEffect(() => {
    const newValue = state.mode === 'visual' ? serializeExpression(state.expression) : state.rawValue

    if (newValue !== value && newValue !== lastEmittedRef.current) {
      lastEmittedRef.current = newValue
      onChange(newValue)
    }
  }, [state.expression, state.rawValue, state.mode, onChange, value])

  const handleModeChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    if ((value === 'visual' && state.mode === 'raw') || (value === 'raw' && state.mode === 'visual')) {
      dispatch({ type: 'TOGGLE_MODE' })
    }
  }

  const handleRawChange = (rawValue: string) => {
    dispatch({ type: 'SET_RAW_VALUE', payload: rawValue })
  }

  // Visual mode: render group or default empty group
  // If root is a single condition, wrap it in a group for consistent UI
  const rawRoot = state.expression.root || createDefaultGroup()
  const rootNode: ExpressionGroupType =
    rawRoot.type === 'condition'
      ? {
          ...createDefaultGroup('AND'),
          children: [rawRoot],
        }
      : rawRoot

  return (
    <Stack
      hasGutter
      id={id}
      aria-label={ariaLabelledBy ? undefined : 'Expression builder'}
      aria-labelledby={ariaLabelledBy}
      role="group"
    >
      <StackItem>
        <div
          style={{
            borderRadius: 'var(--pf-t--global--border-radius--default)',
            paddingLeft: 'var(--pf-t--global--spacer--sm)',
            paddingRight: 'var(--pf-t--global--spacer--sm)',
            backgroundColor: 'var(--pf-t--global--color--surface--primary)',
          }}
        >
          <FormSelect value={state.mode} onChange={handleModeChange} aria-label="Expression editor mode">
            <FormSelectOption value="visual" label="Visual expression builder" />
            <FormSelectOption value="raw" label="Custom expression" />
          </FormSelect>
        </div>
      </StackItem>

      <StackItem>
        <div
          style={{
            borderRadius: 'var(--pf-t--global--border-radius--default)',
            backgroundColor: 'var(--pf-t--global--color--surface--primary)',
          }}
        >
          {state.mode === 'visual' ? (
            <ExpressionGroup
              group={rootNode}
              onChange={(updates) => {
                dispatch({ type: 'UPDATE_ROOT', payload: { ...rootNode, ...updates } })
              }}
              onUpdateChild={(index, node) => {
                const updatedChildren = [...rootNode.children]
                updatedChildren[index] = node
                dispatch({ type: 'UPDATE_ROOT', payload: { ...rootNode, children: updatedChildren } })
              }}
              onRemoveChild={(index) => {
                const updatedChildren = rootNode.children.filter((_, i) => i !== index)
                dispatch({
                  type: 'UPDATE_ROOT',
                  payload: {
                    ...rootNode,
                    children: updatedChildren.length > 0 ? updatedChildren : [createDefaultCondition()],
                  },
                })
              }}
              onAddCondition={() => {
                const updatedChildren = [...rootNode.children, createDefaultCondition()]
                dispatch({ type: 'UPDATE_ROOT', payload: { ...rootNode, children: updatedChildren } })
              }}
              onAddGroup={() => {
                const updatedChildren = [...rootNode.children, createDefaultGroup()]
                dispatch({ type: 'UPDATE_ROOT', payload: { ...rootNode, children: updatedChildren } })
              }}
              level={0}
              error={error}
            />
          ) : (
            <div style={{ padding: 'var(--pf-t--global--spacer--sm)' }}>
              <ExpressionRawEditor
                value={state.rawValue}
                onChange={handleRawChange}
                error={error}
                placeholder={placeholder}
              />
            </div>
          )}
        </div>
      </StackItem>
    </Stack>
  )
}
