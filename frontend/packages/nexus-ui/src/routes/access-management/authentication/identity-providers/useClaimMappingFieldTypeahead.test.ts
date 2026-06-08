import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useClaimMappingFieldTypeahead } from './useClaimMappingFieldTypeahead'

describe('useClaimMappingFieldTypeahead', () => {
  it('returns empty filteredOptions when options is null or undefined', () => {
    const { result: nullOptions } = renderHook(() => useClaimMappingFieldTypeahead(null))
    expect(nullOptions.current.filteredOptions).toEqual([])

    const { result: undefinedOptions } = renderHook(() => useClaimMappingFieldTypeahead(undefined))
    expect(undefinedOptions.current.filteredOptions).toEqual([])
  })

  it('returns all options when filterValue is empty', () => {
    const options = ['sub', 'email', 'mail']
    const { result } = renderHook(() => useClaimMappingFieldTypeahead(options))

    expect(result.current.filteredOptions).toEqual(options)
  })

  it('filters options case-insensitively when filterValue is set', () => {
    const options = ['Email', 'mail', 'Mail', 'other']
    const { result } = renderHook(() => useClaimMappingFieldTypeahead(options))

    act(() => {
      result.current.setFilterValue('mail')
    })

    expect(result.current.filteredOptions).toEqual(['Email', 'mail', 'Mail'])
  })

  it('returns empty filtered list when nothing matches', () => {
    const options = ['a', 'b']
    const { result } = renderHook(() => useClaimMappingFieldTypeahead(options))

    act(() => {
      result.current.setFilterValue('zzz')
    })

    expect(result.current.filteredOptions).toEqual([])
  })

  it('toggles useCustom via setUseCustom', () => {
    const { result } = renderHook(() => useClaimMappingFieldTypeahead(['sub']))

    expect(result.current.useCustom).toBe(false)

    act(() => {
      result.current.setUseCustom(true)
    })
    expect(result.current.useCustom).toBe(true)

    act(() => {
      result.current.setUseCustom(false)
    })
    expect(result.current.useCustom).toBe(false)
  })

  it('updates isOpen via setIsOpen and supports functional updates', () => {
    const { result } = renderHook(() => useClaimMappingFieldTypeahead(['a']))

    expect(result.current.isOpen).toBe(false)

    act(() => {
      result.current.setIsOpen(true)
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.setIsOpen((prev) => !prev)
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('updates filterValue via setFilterValue and exposes it on the hook result', () => {
    const { result } = renderHook(() => useClaimMappingFieldTypeahead(['x', 'y']))

    expect(result.current.filterValue).toBe('')

    act(() => {
      result.current.setFilterValue('hello')
    })
    expect(result.current.filterValue).toBe('hello')

    act(() => {
      result.current.setFilterValue('')
    })
    expect(result.current.filterValue).toBe('')
  })
})
