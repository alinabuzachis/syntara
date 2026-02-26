import { parseExpression } from '../../../../utils/expressions/parser'
import { hasValidationErrors } from '../../../../utils/expressions/validation'
import { ALL_OPERATORS } from '../../../../utils/expressions/defaults'

/**
 * Shared validation rules for conditional expression fields.
 *
 * Used in:
 * - Condition nodes (main condition field)
 * - While loops (loop condition field)
 *
 * Ensures expression:
 * 1. Is not empty
 * 2. Has correct format: ${...}
 * 3. Parses correctly with valid expression tree
 */
export const conditionValidationRules = {
  required: 'Condition is required',
  validate: (value: string | undefined) => {
    if (!value || !value.trim()) return 'Condition cannot be empty'
    if (!value.startsWith('${') || !value.endsWith('}')) {
      return 'Condition must be in format: ${expression}'
    }

    // Parse and validate the expression tree
    const parsed = parseExpression(value)

    // If parsing failed (root is null), check if it's an allowed literal form
    if (!parsed.root) {
      // Extract content from ${...}
      const content = value.slice(2, -1).trim()

      // Stricter validation for allowed literal forms
      // Allow:
      // 1. Simple identifiers/properties: running, user.isActive, data[0].value
      // 2. Boolean/number/string literals: true, false, 123, "string"
      // 3. Complete single comparisons: a > 5, foo == "bar" (but these should parse, so unlikely here)
      //
      // Reject:
      // - Empty content
      // - Logical operators: &&, ||, !, ()
      // - Trailing operators: "a >", "foo ==", "identifier >=", etc.
      // - Leading operators: "> 5", "== value"
      // - Malformed tokens
      // - Unary operators with values: "field exists value"

      if (!content.length) {
        return 'Please fill in all required fields (Field and Value for each condition)'
      }

      // Check for invalid unary operator usage (unary operator followed by extra tokens)
      // Unary operators: exists, isEmpty
      const unaryOperatorWithValuePattern = /\S+\s+(exists|isEmpty)\s+\S+/
      if (unaryOperatorWithValuePattern.test(content)) {
        return 'Operators "exists" and "isEmpty" do not take a value. Remove the value after the operator.'
      }

      // Reject if contains logical operators or parentheses
      if (/[&|!()]/.test(content)) {
        return 'Please fill in all required fields (Field and Value for each condition)'
      }

      // Reject if ends with a comparison operator (trailing operator)
      // Using centralized operator constants to avoid duplication
      // Also includes === and !== for completeness (even though not in our operator set)
      const allOps = [...ALL_OPERATORS, '===', '!=='].join('|')
      const trailingOperatorPattern = new RegExp(`(${allOps})\\s*$`)
      if (trailingOperatorPattern.test(content)) {
        return 'Please fill in all required fields (Field and Value for each condition)'
      }

      // Reject if starts with a comparison operator (leading operator)
      const leadingOperatorPattern = new RegExp(`^\\s*(${allOps})`)
      if (leadingOperatorPattern.test(content)) {
        return 'Please fill in all required fields (Field and Value for each condition)'
      }

      // If we get here, it's likely a simple identifier/literal that didn't parse
      // because it doesn't match the parser's expected structure (no operator found)
      // This is allowed for cases like: ${running}, ${user.isActive}, ${true}, ${false}
    }

    // If parsing succeeded, check for incomplete fields
    if (parsed.root && hasValidationErrors(parsed.root)) {
      return 'Please fill in all required fields (Field and Value for each condition)'
    }

    return true
  },
}
