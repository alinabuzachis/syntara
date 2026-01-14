import { describe, expect, it } from 'vitest'

import { parseToolsString } from './agentHelpers'

describe('agentHelpers', () => {
  describe('parseToolsString', () => {
    it('parses comma-separated tools correctly', () => {
      expect(parseToolsString('calculator, web_search')).toEqual(['calculator', 'web_search'])
    })

    it('trims whitespace from tool names', () => {
      expect(parseToolsString('  tool1  ,  tool2  ,  tool3  ')).toEqual(['tool1', 'tool2', 'tool3'])
    })

    it('filters out empty strings', () => {
      expect(parseToolsString('tool1, , tool2, ,, tool3')).toEqual(['tool1', 'tool2', 'tool3'])
    })

    it('returns undefined for empty string', () => {
      expect(parseToolsString('')).toBeUndefined()
    })

    it('returns undefined for undefined input', () => {
      expect(parseToolsString(undefined)).toBeUndefined()
    })

    it('returns undefined for string with only whitespace and commas', () => {
      expect(parseToolsString('  ,  ,  ')).toBeUndefined()
    })

    it('handles single tool without comma', () => {
      expect(parseToolsString('calculator')).toEqual(['calculator'])
    })

    it('handles tool with spaces in name', () => {
      expect(parseToolsString('web search, calculator')).toEqual(['web search', 'calculator'])
    })
  })
})
