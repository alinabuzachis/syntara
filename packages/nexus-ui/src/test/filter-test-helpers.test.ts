import { describe, expect, it, vi } from 'vitest'

import {
  assertSearchParamsWasCalled,
  assertUrlParam,
  assertUrlParamIsNull,
  getLastSearchParams,
} from './filter-test-helpers'

describe('filter-test-helpers', () => {
  describe('getLastSearchParams', () => {
    it('returns undefined when mock was never called', () => {
      const mockSetSearchParams = vi.fn()

      const result = getLastSearchParams(mockSetSearchParams)

      expect(result).toBeUndefined()
    })

    it('returns URLSearchParams from the most recent call', () => {
      const mockSetSearchParams = vi.fn()
      const firstParams = new URLSearchParams('first=1')
      const secondParams = new URLSearchParams('second=2')
      const thirdParams = new URLSearchParams('third=3')

      mockSetSearchParams(firstParams)
      mockSetSearchParams(secondParams)
      mockSetSearchParams(thirdParams)

      const result = getLastSearchParams(mockSetSearchParams)

      expect(result).toBe(thirdParams)
      expect(result?.get('third')).toBe('3')
    })

    it('returns the only params when called once', () => {
      const mockSetSearchParams = vi.fn()
      const params = new URLSearchParams('key=value')

      mockSetSearchParams(params)

      const result = getLastSearchParams(mockSetSearchParams)

      expect(result).toBe(params)
      expect(result?.get('key')).toBe('value')
    })
  })

  describe('assertUrlParam', () => {
    it('passes when parameter matches expected value', () => {
      const mockSetSearchParams = vi.fn()
      const params = new URLSearchParams('name[contains]=test')
      mockSetSearchParams(params)

      expect(() => {
        assertUrlParam(mockSetSearchParams, 'name[contains]', 'test')
      }).not.toThrow()
    })

    it('throws when parameter value does not match', () => {
      const mockSetSearchParams = vi.fn()
      const params = new URLSearchParams('name[contains]=actual')
      mockSetSearchParams(params)

      expect(() => {
        assertUrlParam(mockSetSearchParams, 'name[contains]', 'expected')
      }).toThrow('Expected URL parameter "name[contains]" to be "expected", but got "actual"')
    })

    it('throws when parameter is not present', () => {
      const mockSetSearchParams = vi.fn()
      const params = new URLSearchParams('other=value')
      mockSetSearchParams(params)

      expect(() => {
        assertUrlParam(mockSetSearchParams, 'missing', 'expected')
      }).toThrow('Expected URL parameter "missing" to be "expected", but got "null"')
    })

    it('throws when setSearchParams was never called', () => {
      const mockSetSearchParams = vi.fn()

      expect(() => {
        assertUrlParam(mockSetSearchParams, 'name', 'test')
      }).toThrow('Expected setSearchParams to be called, but it was not called')
    })

    it('checks the most recent call when called multiple times', () => {
      const mockSetSearchParams = vi.fn()
      const firstParams = new URLSearchParams('name=old')
      const secondParams = new URLSearchParams('name=new')

      mockSetSearchParams(firstParams)
      mockSetSearchParams(secondParams)

      expect(() => {
        assertUrlParam(mockSetSearchParams, 'name', 'new')
      }).not.toThrow()
    })

    it('works with complex parameter keys', () => {
      const mockSetSearchParams = vi.fn()
      const params = new URLSearchParams()
      params.set('name[contains]', 'search-term')
      params.set('created_at[gte]', '2024-01-01')
      mockSetSearchParams(params)

      expect(() => {
        assertUrlParam(mockSetSearchParams, 'name[contains]', 'search-term')
        assertUrlParam(mockSetSearchParams, 'created_at[gte]', '2024-01-01')
      }).not.toThrow()
    })
  })

  describe('assertUrlParamIsNull', () => {
    it('passes when parameter is null (not present)', () => {
      const mockSetSearchParams = vi.fn()
      const params = new URLSearchParams('other=value')
      mockSetSearchParams(params)

      expect(() => {
        assertUrlParamIsNull(mockSetSearchParams, 'cursor')
      }).not.toThrow()
    })

    it('throws when parameter is present', () => {
      const mockSetSearchParams = vi.fn()
      const params = new URLSearchParams('cursor=page-2')
      mockSetSearchParams(params)

      expect(() => {
        assertUrlParamIsNull(mockSetSearchParams, 'cursor')
      }).toThrow('Expected URL parameter "cursor" to be null, but got "page-2"')
    })

    it('throws when setSearchParams was never called', () => {
      const mockSetSearchParams = vi.fn()

      expect(() => {
        assertUrlParamIsNull(mockSetSearchParams, 'cursor')
      }).toThrow('Expected setSearchParams to be called, but it was not called')
    })

    it('passes when parameter is explicitly set to empty string', () => {
      const mockSetSearchParams = vi.fn()
      const params = new URLSearchParams('key=')
      mockSetSearchParams(params)

      // Empty string is not null
      expect(() => {
        assertUrlParamIsNull(mockSetSearchParams, 'key')
      }).toThrow('Expected URL parameter "key" to be null, but got ""')
    })
  })

  describe('assertSearchParamsWasCalled', () => {
    it('passes when setSearchParams was called', () => {
      const mockSetSearchParams = vi.fn()
      mockSetSearchParams(new URLSearchParams())

      expect(() => {
        assertSearchParamsWasCalled(mockSetSearchParams)
      }).not.toThrow()
    })

    it('throws when setSearchParams was never called', () => {
      const mockSetSearchParams = vi.fn()

      expect(() => {
        assertSearchParamsWasCalled(mockSetSearchParams)
      }).toThrow('Expected setSearchParams to be called, but it was not called')
    })

    it('passes when called multiple times', () => {
      const mockSetSearchParams = vi.fn()
      mockSetSearchParams(new URLSearchParams('a=1'))
      mockSetSearchParams(new URLSearchParams('b=2'))

      expect(() => {
        assertSearchParamsWasCalled(mockSetSearchParams)
      }).not.toThrow()
    })
  })
})
