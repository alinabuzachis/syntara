/**
 * Raw text editor fallback for the expression builder
 * Provides a plain TextArea for complex expressions that can't be parsed
 */

import { TextArea } from '@patternfly/react-core'

type ExpressionRawEditorProps = {
  /** Raw template string value */
  value: string
  /** Callback when value changes */
  onChange: (value: string) => void
  /** Whether to show error state */
  error?: boolean
  /** Placeholder text */
  placeholder?: string
}

/**
 * Raw text editor component
 *
 * Fallback editor for expressions that can't be parsed into visual representation
 * Allows direct editing of template strings
 */
export function ExpressionRawEditor(props: ExpressionRawEditorProps) {
  const { value, onChange, error, placeholder = '${expression}' } = props

  return (
    <TextArea
      value={value}
      onChange={(_event, val) => onChange(val)}
      placeholder={placeholder}
      rows={3}
      resizeOrientation="vertical"
      style={{
        fontFamily: 'monospace',
        fontSize: 'var(--pf-t--global--font--size--body--sm)',
        width: '100%',
      }}
      validated={error ? 'error' : 'default'}
      aria-label="Raw expression"
    />
  )
}
