import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useBlurOnOpen } from './useBlurOnOpen'

describe('useBlurOnOpen', () => {
  it('blurs the active element when isOpen transitions from false to true', () => {
    const blurSpy = vi.fn()
    Object.defineProperty(document, 'activeElement', {
      value: { blur: blurSpy },
      writable: true,
      configurable: true,
    })

    const { rerender } = renderHook(({ isOpen }) => useBlurOnOpen(isOpen), {
      initialProps: { isOpen: false },
    })

    rerender({ isOpen: true })

    expect(blurSpy).toHaveBeenCalledOnce()
  })

  it('blurs when component mounts with isOpen already true (keyed remount)', () => {
    const blurSpy = vi.fn()
    Object.defineProperty(document, 'activeElement', {
      value: { blur: blurSpy },
      writable: true,
      configurable: true,
    })

    renderHook(({ isOpen }) => useBlurOnOpen(isOpen), {
      initialProps: { isOpen: true },
    })

    expect(blurSpy).toHaveBeenCalledOnce()
  })

  it('does not blur again when isOpen stays true after initial blur', () => {
    const blurSpy = vi.fn()
    Object.defineProperty(document, 'activeElement', {
      value: { blur: blurSpy },
      writable: true,
      configurable: true,
    })

    const { rerender } = renderHook(({ isOpen }) => useBlurOnOpen(isOpen), {
      initialProps: { isOpen: true },
    })

    blurSpy.mockClear()
    rerender({ isOpen: true })

    expect(blurSpy).not.toHaveBeenCalled()
  })

  it('does not blur when isOpen transitions from true to false', () => {
    const blurSpy = vi.fn()
    Object.defineProperty(document, 'activeElement', {
      value: { blur: blurSpy },
      writable: true,
      configurable: true,
    })

    const { rerender } = renderHook(({ isOpen }) => useBlurOnOpen(isOpen), {
      initialProps: { isOpen: true },
    })

    blurSpy.mockClear()
    rerender({ isOpen: false })

    expect(blurSpy).not.toHaveBeenCalled()
  })

  it('blurs again after close and reopen cycle', () => {
    const blurSpy = vi.fn()
    Object.defineProperty(document, 'activeElement', {
      value: { blur: blurSpy },
      writable: true,
      configurable: true,
    })

    const { rerender } = renderHook(({ isOpen }) => useBlurOnOpen(isOpen), {
      initialProps: { isOpen: false },
    })

    rerender({ isOpen: true })
    expect(blurSpy).toHaveBeenCalledOnce()

    blurSpy.mockClear()
    rerender({ isOpen: false })
    rerender({ isOpen: true })

    expect(blurSpy).toHaveBeenCalledOnce()
  })

  it('handles null activeElement gracefully', () => {
    Object.defineProperty(document, 'activeElement', {
      value: null,
      writable: true,
      configurable: true,
    })

    const { rerender } = renderHook(({ isOpen }) => useBlurOnOpen(isOpen), {
      initialProps: { isOpen: false },
    })

    expect(() => rerender({ isOpen: true })).not.toThrow()
  })

  it('handles activeElement without blur method gracefully', () => {
    Object.defineProperty(document, 'activeElement', {
      value: {},
      writable: true,
      configurable: true,
    })

    const { rerender } = renderHook(({ isOpen }) => useBlurOnOpen(isOpen), {
      initialProps: { isOpen: false },
    })

    expect(() => rerender({ isOpen: true })).not.toThrow()
  })
})
