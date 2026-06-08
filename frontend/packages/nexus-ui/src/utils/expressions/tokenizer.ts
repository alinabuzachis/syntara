/**
 * Tokenizer for condition expressions
 *
 * Converts expression strings into structured tokens for transformation and parsing.
 * Handles Python-style operators (and, or, not, in) and JavaScript-style operators (&&, ||, !, contains).
 */

import { WORD_OPERATORS } from './operators'

// Create a set of word operators for efficient O(1) lookup during tokenization
const WORD_OPERATOR_SET = new Set(WORD_OPERATORS)

export const TokenType = {
  VARIABLE: 'VARIABLE', // ${variable.path}
  STRING: 'STRING', // "string" or 'string'
  NUMBER: 'NUMBER', // 123, 45.67, -10
  BOOLEAN: 'BOOLEAN', // true, false
  OPERATOR: 'OPERATOR', // ==, !=, >, <, >=, <=, contains
  BOOL_OP: 'BOOL_OP', // and, or (Python) or &&, || (JavaScript)
  NOT_OP: 'NOT_OP', // not (Python) or ! (JavaScript)
  IN_OP: 'IN_OP', // in, not in (Python)
  LPAREN: 'LPAREN', // (
  RPAREN: 'RPAREN', // )
  WHITESPACE: 'WHITESPACE', // spaces, tabs
  UNKNOWN: 'UNKNOWN', // unrecognized characters
} as const

export type TokenType = (typeof TokenType)[keyof typeof TokenType]

export type Token = {
  type: TokenType
  value: string
  start: number
  end: number
}

/**
 * Tokenize whitespace characters.
 */
function tokenizeWhitespace(expression: string, start: number): { token: Token; nextIndex: number } {
  let i = start
  while (i < expression.length && /\s/.test(expression[i])) {
    i++
  }
  return {
    token: { type: TokenType.WHITESPACE, value: expression.slice(start, i), start, end: i },
    nextIndex: i,
  }
}

/**
 * Tokenize variable: ${...}
 */
function tokenizeVariable(expression: string, start: number): { token: Token; nextIndex: number } {
  let i = start + 2 // skip ${
  let braceCount = 1
  while (i < expression.length && braceCount > 0) {
    if (expression[i] === '{') braceCount++
    if (expression[i] === '}') braceCount--
    i++
  }
  return {
    token: { type: TokenType.VARIABLE, value: expression.slice(start, i), start, end: i },
    nextIndex: i,
  }
}

/**
 * Tokenize string literal: "..." or '...'
 */
function tokenizeString(expression: string, start: number, quote: string): { token: Token; nextIndex: number } {
  let i = start + 1 // skip opening quote
  while (i < expression.length && expression[i] !== quote) {
    if (expression[i] === '\\') i++ // skip escaped character
    i++
  }
  if (i < expression.length) i++ // skip closing quote only if present
  return {
    token: { type: TokenType.STRING, value: expression.slice(start, i), start, end: i },
    nextIndex: i,
  }
}

/**
 * Tokenize two-character operators: ==, !=, >=, <=, &&, ||
 * Uses direct character comparison to avoid string allocation on every call.
 */
function tokenizeTwoCharOperator(expression: string, start: number): { token: Token; nextIndex: number } | null {
  const c1 = expression[start]
  const c2 = start + 1 < expression.length ? expression[start + 1] : ''
  const op = c1 + c2

  if (op === '==' || op === '!=' || op === '>=' || op === '<=' || op === '&&' || op === '||') {
    const type = op === '&&' || op === '||' ? TokenType.BOOL_OP : TokenType.OPERATOR
    return {
      token: { type, value: op, start, end: start + 2 },
      nextIndex: start + 2,
    }
  }
  return null
}

/**
 * Tokenize keywords and identifiers: and, or, not, in, true, false, contains
 */
function tokenizeKeyword(expression: string, start: number): { token: Token; nextIndex: number } {
  let i = start
  while (i < expression.length && /[a-zA-Z_]/.test(expression[i])) {
    i++
  }
  const word = expression.slice(start, i)

  // Check for "not in" (two-word operator)
  if (word === 'not') {
    let j = i
    while (j < expression.length && /\s/.test(expression[j])) j++
    const afterIn = j + 2
    const isWordBoundary = afterIn >= expression.length || !/[a-zA-Z_]/.test(expression[afterIn])
    if (expression.slice(j, j + 2) === 'in' && isWordBoundary) {
      return {
        token: { type: TokenType.IN_OP, value: 'not in', start, end: j + 2 },
        nextIndex: j + 2,
      }
    }
    return {
      token: { type: TokenType.NOT_OP, value: word, start, end: i },
      nextIndex: i,
    }
  }

  // Classify word
  let type: TokenType
  if (word === 'and' || word === 'or') {
    type = TokenType.BOOL_OP
  } else if (word === 'in') {
    type = TokenType.IN_OP
  } else if (word === 'true' || word === 'false') {
    type = TokenType.BOOLEAN
  } else if (WORD_OPERATOR_SET.has(word as never)) {
    type = TokenType.OPERATOR
  } else {
    type = TokenType.UNKNOWN
  }

  return {
    token: { type, value: word, start, end: i },
    nextIndex: i,
  }
}

/**
 * Tokenize number: 123, 45.67, -10
 * Enforces valid numeric format: at most one decimal point, at least one digit
 */
function tokenizeNumber(expression: string, start: number): { token: Token; nextIndex: number } | null {
  const remaining = expression.slice(start)
  // Match valid number: optional '-', then digits with optional decimal (requires digit after dot),
  // or decimal point followed by digits (e.g., .25)
  const match = /^-?(?:\d+(?:\.\d+)?|\.\d+)/.exec(remaining)

  if (!match) {
    return null
  }

  const value = match[0]
  const end = start + value.length

  return {
    token: { type: TokenType.NUMBER, value, start, end },
    nextIndex: end,
  }
}

/**
 * Try to tokenize at current position.
 * @returns Result with token and next index, or null if no match
 */
function tryTokenizeAt(expression: string, i: number): { token: Token; nextIndex: number } | null {
  const char = expression[i]
  const remaining = expression.slice(i)

  // Whitespace
  if (/\s/.test(char)) {
    return tokenizeWhitespace(expression, i)
  }

  // Variable: ${...}
  if (remaining.startsWith('${')) {
    return tokenizeVariable(expression, i)
  }

  // String: "..." or '...'
  if (char === '"' || char === "'") {
    return tokenizeString(expression, i, char)
  }

  // Parentheses
  if (char === '(') {
    return { token: { type: TokenType.LPAREN, value: '(', start: i, end: i + 1 }, nextIndex: i + 1 }
  }
  if (char === ')') {
    return { token: { type: TokenType.RPAREN, value: ')', start: i, end: i + 1 }, nextIndex: i + 1 }
  }

  // Two-character operators
  const twoCharResult = tokenizeTwoCharOperator(expression, i)
  if (twoCharResult) {
    return twoCharResult
  }

  // Single-character operators
  if (char === '>' || char === '<' || char === '!') {
    const type = char === '!' ? TokenType.NOT_OP : TokenType.OPERATOR
    return { token: { type, value: char, start: i, end: i + 1 }, nextIndex: i + 1 }
  }

  // Keywords and identifiers
  if (/[a-zA-Z_]/.test(char)) {
    return tokenizeKeyword(expression, i)
  }

  // Numbers
  if (/\d/.test(char) || (char === '-' && i + 1 < expression.length && /\d/.test(expression[i + 1]))) {
    return tokenizeNumber(expression, i)
  }

  return null
}

/**
 * Tokenize a condition expression into structured tokens.
 *
 * @param expression - Condition expression string
 * @returns Array of tokens
 *
 * @example
 * tokenize('${status} == "completed" and "Hello" in ${output}')
 * // Returns:
 * // [
 * //   { type: 'VARIABLE', value: '${status}', start: 0, end: 9 },
 * //   { type: 'WHITESPACE', value: ' ', start: 9, end: 10 },
 * //   { type: 'OPERATOR', value: '==', start: 10, end: 12 },
 * //   { type: 'WHITESPACE', value: ' ', start: 12, end: 13 },
 * //   { type: 'STRING', value: '"completed"', start: 13, end: 24 },
 * //   { type: 'WHITESPACE', value: ' ', start: 24, end: 25 },
 * //   { type: 'BOOL_OP', value: 'and', start: 25, end: 28 },
 * //   ...
 * // ]
 */
export function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < expression.length) {
    const result = tryTokenizeAt(expression, i)

    if (result) {
      tokens.push(result.token)
      i = result.nextIndex
    } else {
      // Unknown character
      tokens.push({ type: TokenType.UNKNOWN, value: expression[i], start: i, end: i + 1 })
      i++
    }
  }

  return tokens
}

/**
 * Filter out whitespace tokens from a token array.
 *
 * @param tokens - Array of tokens
 * @returns Array of tokens without whitespace
 */
export function stripWhitespace(tokens: Token[]): Token[] {
  return tokens.filter((t) => t.type !== TokenType.WHITESPACE)
}

/**
 * Convert tokens back into an expression string.
 *
 * @param tokens - Array of tokens
 * @returns Reconstructed expression string
 */
export function detokenize(tokens: Token[]): string {
  return tokens.map((t) => t.value).join('')
}
