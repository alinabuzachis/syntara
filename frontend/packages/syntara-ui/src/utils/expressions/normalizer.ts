/**
 * Expression normalizer for visual builder round-trip support
 *
 * Transforms Python-style operators to JavaScript-style for parsing in the visual builder.
 * This enables loading saved workflows (which use Python operators) back into the visual builder.
 *
 * Transformations:
 * - and → &&
 * - or → ||
 * - not → !
 * - "value" in ${var} → ${var} contains "value" (reversed operands)
 * - "value" not in ${var} → !(${var} contains "value") (reversed + negated)
 */

import { type Token, TokenType, tokenize, detokenize, stripWhitespace } from './tokenizer'

/**
 * Transform boolean operators: and/or → &&/||
 */
function transformBooleanOperator(token: Token): Token {
  if (token.value === 'and') {
    return { ...token, type: TokenType.BOOL_OP, value: '&&' }
  }
  if (token.value === 'or') {
    return { ...token, type: TokenType.BOOL_OP, value: '||' }
  }
  return token // Already JavaScript style (&&, ||)
}

/**
 * Transform not operator: not → !
 */
function transformNotOperator(token: Token): Token {
  if (token.value === 'not') {
    return { ...token, type: TokenType.NOT_OP, value: '!' }
  }
  return token // Already JavaScript style (!)
}

/**
 * Transform "in" operator: "value" in ${var} → ${var} contains "value"
 */
function transformInOperator(
  token: Token,
  prevToken: Token | undefined,
  nextToken: Token | undefined,
  result: Token[]
): { transformed: boolean; consumeNext: boolean } {
  // Validate pattern: <string/variable> in <variable>
  if (!prevToken || !nextToken) {
    return { transformed: false, consumeNext: false }
  }

  const isValidPattern =
    (prevToken.type === TokenType.STRING || prevToken.type === TokenType.VARIABLE) &&
    nextToken.type === TokenType.VARIABLE

  if (!isValidPattern) {
    return { transformed: false, consumeNext: false }
  }

  if (token.value === 'in') {
    // Transform: "value" in ${var} → ${var} contains "value"
    const poppedToken = result.pop()
    if (!poppedToken) {
      throw new Error('Malformed "in" expression: missing left operand')
    }
    const stringToken = prevToken // Already validated as non-null above
    const variableToken = nextToken

    // Add in reversed order: variable, operator, string
    result.push(variableToken, { ...token, type: TokenType.OPERATOR, value: 'contains' }, stringToken)

    return { transformed: true, consumeNext: true }
  }

  if (token.value === 'not in') {
    // Transform: "value" not in ${var} → !(${var} contains "value")
    const poppedToken = result.pop()
    if (!poppedToken) {
      throw new Error('Malformed "not in" expression: missing left operand')
    }
    const stringToken = prevToken // Already validated as non-null above
    const variableToken = nextToken

    // Add: !(variable contains string)
    result.push(
      { ...token, type: TokenType.NOT_OP, value: '!' },
      { ...token, type: TokenType.LPAREN, value: '(' },
      variableToken,
      { ...token, type: TokenType.OPERATOR, value: 'contains' },
      stringToken,
      { ...token, type: TokenType.RPAREN, value: ')' }
    )

    return { transformed: true, consumeNext: true }
  }

  return { transformed: false, consumeNext: false }
}

/**
 * Transform tokens from Python-style to JavaScript-style operators.
 *
 * @param tokens - Array of tokens (whitespace stripped)
 * @returns Transformed array of tokens
 */
function transformTokens(tokens: Token[]): Token[] {
  const result: Token[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    // Transform boolean operators: and/or → &&/||
    if (token.type === TokenType.BOOL_OP) {
      result.push(transformBooleanOperator(token))
      continue
    }

    // Transform not operator: not → !
    if (token.type === TokenType.NOT_OP) {
      result.push(transformNotOperator(token))
      continue
    }

    // Transform "in" operator: "value" in ${var} → ${var} contains "value"
    if (token.type === TokenType.IN_OP) {
      const prevToken = result.at(-1)
      const nextToken = tokens[i + 1]
      const { transformed, consumeNext } = transformInOperator(token, prevToken, nextToken, result)

      if (transformed) {
        if (consumeNext) {
          i++ // Skip next token (already consumed)
        }
        continue
      }

      // If pattern doesn't match, keep token as-is
      result.push(token)
      continue
    }

    // All other tokens pass through unchanged
    result.push(token)
  }

  return result
}

/**
 * Add appropriate whitespace between tokens for readability.
 *
 * @param tokens - Array of tokens without whitespace
 * @returns Array of tokens with whitespace added
 */
function addWhitespace(tokens: Token[]): Token[] {
  const result: Token[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const prevToken = tokens[i - 1]

    // Add space before token if needed
    if (prevToken && shouldAddSpaceBefore(prevToken, token)) {
      result.push({
        type: TokenType.WHITESPACE,
        value: ' ',
        start: token.start,
        end: token.start,
      })
    }

    result.push(token)
  }

  return result
}

/**
 * Determine if a space should be added between two tokens.
 */
function shouldAddSpaceBefore(prev: Token, current: Token): boolean {
  // No space after opening parenthesis
  if (prev.type === TokenType.LPAREN) return false

  // No space before closing parenthesis
  if (current.type === TokenType.RPAREN) return false

  // No space after NOT operator if next is opening paren: "!("
  if (prev.type === TokenType.NOT_OP && current.type === TokenType.LPAREN) return false

  // Add space before/after most other tokens
  return true
}

/**
 * Normalize a Python-style condition expression to JavaScript-style for parsing.
 *
 * @param expression - Condition expression string (Python-style)
 * @returns Normalized expression string (JavaScript-style)
 *
 * @example
 * normalizeBackendExpression('${status} == "completed" and "Hello" in ${output}')
 * // Returns: '${status} == "completed" && ${output} contains "Hello"'
 *
 * @example
 * normalizeBackendExpression('"spam" not in ${email.body}')
 * // Returns: '!(${email.body} contains "spam")'
 */
export function normalizeBackendExpression(expression: string): string {
  // Tokenize the expression
  const tokens = tokenize(expression)

  // Strip whitespace for easier processing
  const strippedTokens = stripWhitespace(tokens)

  // Transform Python operators to JavaScript
  const transformedTokens = transformTokens(strippedTokens)

  // Add whitespace back for readability
  const spacedTokens = addWhitespace(transformedTokens)

  // Convert back to string
  return detokenize(spacedTokens)
}
