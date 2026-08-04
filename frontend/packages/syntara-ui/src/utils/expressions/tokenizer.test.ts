import { describe, it, expect } from 'vitest'

import { tokenize, stripWhitespace, detokenize, TokenType } from './tokenizer'

describe('tokenizer', () => {
  describe('tokenize', () => {
    it('tokenizes variables', () => {
      const tokens = tokenize('${status}')
      expect(tokens).toHaveLength(1)
      expect(tokens[0]).toEqual({
        type: TokenType.VARIABLE,
        value: '${status}',
        start: 0,
        end: 9,
      })
    })

    it('tokenizes nested variables', () => {
      const tokens = tokenize('${user.profile.age}')
      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.VARIABLE)
      expect(tokens[0].value).toBe('${user.profile.age}')
    })

    it('tokenizes string literals with double quotes', () => {
      const tokens = tokenize('"completed"')
      expect(tokens).toHaveLength(1)
      expect(tokens[0]).toEqual({
        type: TokenType.STRING,
        value: '"completed"',
        start: 0,
        end: 11,
      })
    })

    it('tokenizes string literals with single quotes', () => {
      const tokens = tokenize("'active'")
      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe("'active'")
    })

    it('tokenizes string with escaped quotes', () => {
      const tokens = tokenize('"He said \\"Hello\\""')
      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe(TokenType.STRING)
      expect(tokens[0].value).toBe('"He said \\"Hello\\""')
    })

    it('tokenizes numbers', () => {
      const tokens = stripWhitespace(tokenize('123 45.67 -10'))
      expect(tokens).toHaveLength(3)
      expect(tokens[0]).toMatchObject({ type: TokenType.NUMBER, value: '123' })
      expect(tokens[1]).toMatchObject({ type: TokenType.NUMBER, value: '45.67' })
      expect(tokens[2]).toMatchObject({ type: TokenType.NUMBER, value: '-10' })
    })

    it('tokenizes booleans', () => {
      const tokens = stripWhitespace(tokenize('true false'))
      expect(tokens).toHaveLength(2)
      expect(tokens[0]).toMatchObject({ type: TokenType.BOOLEAN, value: 'true' })
      expect(tokens[1]).toMatchObject({ type: TokenType.BOOLEAN, value: 'false' })
    })

    it('tokenizes comparison operators', () => {
      const tokens = stripWhitespace(tokenize('== != > < >= <='))
      expect(tokens).toHaveLength(6)
      expect(tokens.map((t) => t.value)).toEqual(['==', '!=', '>', '<', '>=', '<='])
      expect(tokens.every((t) => t.type === TokenType.OPERATOR)).toBe(true)
    })

    it('tokenizes boolean operators', () => {
      const tokens = stripWhitespace(tokenize('and or && ||'))
      expect(tokens).toHaveLength(4)
      expect(tokens.map((t) => t.value)).toEqual(['and', 'or', '&&', '||'])
      expect(tokens.every((t) => t.type === TokenType.BOOL_OP)).toBe(true)
    })

    it('tokenizes not operator', () => {
      const tokens = stripWhitespace(tokenize('not !'))
      expect(tokens).toHaveLength(2)
      expect(tokens.map((t) => t.value)).toEqual(['not', '!'])
      expect(tokens.every((t) => t.type === TokenType.NOT_OP)).toBe(true)
    })

    it('tokenizes in operator', () => {
      const tokens = stripWhitespace(tokenize('in'))
      expect(tokens).toHaveLength(1)
      expect(tokens[0]).toMatchObject({ type: TokenType.IN_OP, value: 'in' })
    })

    it('tokenizes "not in" as single operator', () => {
      const tokens = stripWhitespace(tokenize('not in'))
      expect(tokens).toHaveLength(1)
      expect(tokens[0]).toMatchObject({ type: TokenType.IN_OP, value: 'not in' })
    })

    it('tokenizes contains operator', () => {
      const tokens = stripWhitespace(tokenize('contains'))
      expect(tokens).toHaveLength(1)
      expect(tokens[0]).toMatchObject({ type: TokenType.OPERATOR, value: 'contains' })
    })

    it('tokenizes parentheses', () => {
      const tokens = stripWhitespace(tokenize('()'))
      expect(tokens).toHaveLength(2)
      expect(tokens[0]).toMatchObject({ type: TokenType.LPAREN, value: '(' })
      expect(tokens[1]).toMatchObject({ type: TokenType.RPAREN, value: ')' })
    })

    it('tokenizes whitespace between tokens', () => {
      const tokens = tokenize('true   false')
      expect(tokens).toHaveLength(3)
      expect(tokens[0]).toMatchObject({ type: TokenType.BOOLEAN, value: 'true' })
      expect(tokens[1]).toMatchObject({ type: TokenType.WHITESPACE, value: '   ' })
      expect(tokens[2]).toMatchObject({ type: TokenType.BOOLEAN, value: 'false' })
    })

    it('tokenizes complex expression with Python operators', () => {
      const tokens = stripWhitespace(tokenize('${status} == "completed" and "Hello" in ${output}'))

      expect(tokens).toHaveLength(7)
      expect(tokens.map((t) => ({ type: t.type, value: t.value }))).toEqual([
        { type: TokenType.VARIABLE, value: '${status}' },
        { type: TokenType.OPERATOR, value: '==' },
        { type: TokenType.STRING, value: '"completed"' },
        { type: TokenType.BOOL_OP, value: 'and' },
        { type: TokenType.STRING, value: '"Hello"' },
        { type: TokenType.IN_OP, value: 'in' },
        { type: TokenType.VARIABLE, value: '${output}' },
      ])
    })

    it('tokenizes complex expression with JavaScript operators', () => {
      const tokens = stripWhitespace(tokenize('${status} == "completed" && ${output} contains "Hello"'))

      expect(tokens).toHaveLength(7)
      expect(tokens.map((t) => ({ type: t.type, value: t.value }))).toEqual([
        { type: TokenType.VARIABLE, value: '${status}' },
        { type: TokenType.OPERATOR, value: '==' },
        { type: TokenType.STRING, value: '"completed"' },
        { type: TokenType.BOOL_OP, value: '&&' },
        { type: TokenType.VARIABLE, value: '${output}' },
        { type: TokenType.OPERATOR, value: 'contains' },
        { type: TokenType.STRING, value: '"Hello"' },
      ])
    })

    it('tokenizes nested parentheses', () => {
      const tokens = stripWhitespace(tokenize('not ((${a} == 1 and ${b} == 2))'))

      expect(tokens[0].value).toBe('not')
      expect(tokens[1].value).toBe('(')
      expect(tokens[2].value).toBe('(')
      expect(tokens[tokens.length - 2].value).toBe(')')
      expect(tokens[tokens.length - 1].value).toBe(')')
    })

    describe('stripWhitespace', () => {
      it('removes whitespace tokens', () => {
        const tokens = tokenize('${a} == 1')
        const stripped = stripWhitespace(tokens)

        expect(stripped.every((t) => t.type !== TokenType.WHITESPACE)).toBe(true)
        expect(stripped).toHaveLength(3)
      })
    })

    describe('detokenize', () => {
      it('reconstructs expression from tokens', () => {
        const original = '${status} == "completed" and "Hello" in ${output}'
        const tokens = tokenize(original)
        const reconstructed = detokenize(tokens)

        expect(reconstructed).toBe(original)
      })

      it('reconstructs expression with whitespace preserved', () => {
        const original = '${a}  ==   "value"'
        const tokens = tokenize(original)
        const reconstructed = detokenize(tokens)

        expect(reconstructed).toBe(original)
      })

      it('reconstructs complex nested expression', () => {
        const original = 'not ((${age} >= 18 and ${verified} == true) or ${admin} == true)'
        const tokens = tokenize(original)
        const reconstructed = detokenize(tokens)

        expect(reconstructed).toBe(original)
      })
    })
  })
})
