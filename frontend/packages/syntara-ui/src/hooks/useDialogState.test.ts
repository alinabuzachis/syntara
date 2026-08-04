import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useDialogState } from './useDialogState'

type TestItem = {
  id: string
  name: string
}

describe('useDialogState', () => {
  it('starts with isOpen false and item null', () => {
    // Arrange & Act
    const { result } = renderHook(() => useDialogState<TestItem>())

    // Assert
    expect(result.current.isOpen).toBe(false)
    expect(result.current.item).toBeNull()
  })

  it('opens the dialog with the given item', () => {
    // Arrange
    const { result } = renderHook(() => useDialogState<TestItem>())
    const item: TestItem = { id: '1', name: 'Alice' }

    // Act
    act(() => {
      result.current.open(item)
    })

    // Assert
    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toEqual(item)
  })

  it('closes the dialog and clears the item', () => {
    // Arrange
    const { result } = renderHook(() => useDialogState<TestItem>())
    const item: TestItem = { id: '1', name: 'Alice' }

    act(() => {
      result.current.open(item)
    })

    // Act
    act(() => {
      result.current.close()
    })

    // Assert
    expect(result.current.isOpen).toBe(false)
    expect(result.current.item).toBeNull()
  })

  it('replaces the previous item when opened with a different item', () => {
    // Arrange
    const { result } = renderHook(() => useDialogState<TestItem>())
    const firstItem: TestItem = { id: '1', name: 'Alice' }
    const secondItem: TestItem = { id: '2', name: 'Bob' }

    act(() => {
      result.current.open(firstItem)
    })

    // Act
    act(() => {
      result.current.open(secondItem)
    })

    // Assert
    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toEqual(secondItem)
    expect(result.current.item).not.toEqual(firstItem)
  })

  it('completes a full open-then-close lifecycle', () => {
    // Arrange
    const { result } = renderHook(() => useDialogState<TestItem>())
    const item: TestItem = { id: '1', name: 'Alice' }

    // Act & Assert: open
    act(() => {
      result.current.open(item)
    })
    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toEqual(item)

    // Act & Assert: close
    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)
    expect(result.current.item).toBeNull()
  })

  it('handles closing when already closed (no-op)', () => {
    // Arrange
    const { result } = renderHook(() => useDialogState<TestItem>())

    // Act
    act(() => {
      result.current.close()
    })

    // Assert
    expect(result.current.isOpen).toBe(false)
    expect(result.current.item).toBeNull()
  })

  it('works with primitive types', () => {
    // Arrange
    const { result } = renderHook(() => useDialogState<string>())

    // Act
    act(() => {
      result.current.open('delete-me')
    })

    // Assert
    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toBe('delete-me')
  })

  it('maintains stable callback references across renders', () => {
    // Arrange
    const { result, rerender } = renderHook(() => useDialogState<TestItem>())

    const openBefore = result.current.open
    const closeBefore = result.current.close

    // Act
    rerender()

    // Assert — useCallback should preserve identity
    expect(result.current.open).toBe(openBefore)
    expect(result.current.close).toBe(closeBefore)
  })

  it('supports multiple open-close cycles', () => {
    // Arrange
    const { result } = renderHook(() => useDialogState<TestItem>())
    const itemA: TestItem = { id: '1', name: 'Alice' }
    const itemB: TestItem = { id: '2', name: 'Bob' }

    // Act & Assert: first cycle
    act(() => {
      result.current.open(itemA)
    })
    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toEqual(itemA)

    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)
    expect(result.current.item).toBeNull()

    // Act & Assert: second cycle with different item
    act(() => {
      result.current.open(itemB)
    })
    expect(result.current.isOpen).toBe(true)
    expect(result.current.item).toEqual(itemB)

    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)
    expect(result.current.item).toBeNull()
  })
})
