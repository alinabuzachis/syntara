import { FormGroup, HelperText, HelperTextItem, TextInput } from '@patternfly/react-core'
import { useCallback, useState } from 'react'

import { buildContextExpression, buildExpression } from '../../../../utils/expressions/templateBuilder'
import {
  DRAG_TYPE_CONTEXT,
  DRAG_TYPE_FIELD,
  DROP_TARGET_OUTLINE,
  EXPRESSION_FIELD_PLACEHOLDER,
  isDragData,
} from '../utils/dragTypes'

type ExpressionFormFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  isRequired?: boolean
  error?: string
}

function validateExpressionSyntax(value: string): string | null {
  if (!value.includes('${')) return null
  if (value.includes('${}')) return 'Invalid syntax'

  // Extract all matched ${...} expressions and check bracket balance
  const expressionPattern = /\$\{([^}]*)\}/g
  let match: RegExpExecArray | null = expressionPattern.exec(value)
  while (match !== null) {
    const body = match[1]
    const openBrackets = (body.match(/\[/g) ?? []).length
    const closeBrackets = (body.match(/\]/g) ?? []).length
    if (openBrackets !== closeBrackets) return 'Invalid syntax'
    match = expressionPattern.exec(value)
  }

  // Check for unpaired ${ (opening without a matching close)
  const withoutMatched = value.replace(/\$\{[^}]*\}/g, '')
  if (withoutMatched.includes('${')) return 'Invalid syntax'

  return null
}

function ExpressionFormField({
  id,
  label,
  value,
  onChange,
  placeholder = EXPRESSION_FIELD_PLACEHOLDER,
  isRequired = false,
  error,
}: Readonly<ExpressionFormFieldProps>) {
  const [isDropTarget, setIsDropTarget] = useState(false)
  const syntaxError = validateExpressionSyntax(value)
  const displayError = error ?? syntaxError
  const hasError = Boolean(displayError)

  const handleChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, newValue: string) => {
      onChange(newValue)
    },
    [onChange]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDropTarget(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDropTarget(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDropTarget(false)
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return
      let data: unknown
      try {
        data = JSON.parse(raw)
      } catch {
        return
      }
      if (!isDragData(data)) return
      if (data.type === DRAG_TYPE_FIELD) {
        onChange((value ?? '') + buildExpression({ nodeId: data.nodeId, fieldPath: data.fieldPath }))
      } else if (data.type === DRAG_TYPE_CONTEXT) {
        onChange((value ?? '') + buildContextExpression(data.contextPath))
      }
    },
    [onChange, value]
  )

  return (
    <FormGroup
      label={label}
      isRequired={isRequired}
      fieldId={id}
      data-drop-target={isDropTarget ? 'active' : 'inactive'}
    >
      <TextInput
        id={id}
        value={value}
        onChange={handleChange}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        placeholder={placeholder}
        validated={hasError ? 'error' : 'default'}
        style={isDropTarget ? DROP_TARGET_OUTLINE : undefined}
      />
      {displayError && (
        <HelperText>
          <HelperTextItem variant="error">{displayError}</HelperTextItem>
        </HelperText>
      )}
    </FormGroup>
  )
}

export { ExpressionFormField }
export type { ExpressionFormFieldProps }
