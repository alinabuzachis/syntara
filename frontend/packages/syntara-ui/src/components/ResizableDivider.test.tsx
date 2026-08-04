import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ResizableDivider } from './ResizableDivider'

describe('ResizableDivider', () => {
  afterEach(() => {
    // Clean up body styles after each test
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('renders without accessibility violations', async () => {
    const onResize = vi.fn()
    const { container } = render(<ResizableDivider onResize={onResize} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has proper ARIA attributes with default value', () => {
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator', { name: 'Resize canvas and details panel' })
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal')
    expect(separator).toHaveAttribute('aria-valuenow', '50')
    expect(separator).toHaveAttribute('aria-valuemin', '0')
    expect(separator).toHaveAttribute('aria-valuemax', '100')
  })

  it('has proper ARIA attributes with custom value', () => {
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} currentValue={60} />)
    const separator = screen.getByRole('separator', { name: 'Resize canvas and details panel' })
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal')
    expect(separator).toHaveAttribute('aria-valuenow', '60')
    expect(separator).toHaveAttribute('aria-valuemin', '0')
    expect(separator).toHaveAttribute('aria-valuemax', '100')
  })

  it('responds to keyboard arrow down', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator')

    separator.focus()
    await user.keyboard('{ArrowDown}')

    expect(onResize).toHaveBeenCalledWith(20)
  })

  it('responds to keyboard arrow up', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator')

    separator.focus()
    await user.keyboard('{ArrowUp}')

    expect(onResize).toHaveBeenCalledWith(-20)
  })

  it('ignores other keyboard keys', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator')

    separator.focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')
    await user.keyboard('a')

    expect(onResize).not.toHaveBeenCalled()
  })

  it('initiates drag on mouse down', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientY: 100 } })

    expect(document.body.style.cursor).toBe('row-resize')
    expect(document.body.style.userSelect).toBe('none')
  })

  it('calls onResize during mouse drag', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientY: 100 } })
    await user.pointer({ target: document.body, coords: { clientY: 120 } })

    expect(onResize).toHaveBeenCalledWith(20)
  })

  it('updates delta correctly on consecutive mouse moves', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientY: 100 } })
    await user.pointer({ target: document.body, coords: { clientY: 120 } })
    await user.pointer({ target: document.body, coords: { clientY: 150 } })

    expect(onResize).toHaveBeenCalledTimes(2)
    expect(onResize).toHaveBeenNthCalledWith(1, 20) // 120 - 100
    expect(onResize).toHaveBeenNthCalledWith(2, 30) // 150 - 120
  })

  it('handles upward mouse drag with negative delta', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientY: 100 } })
    await user.pointer({ target: document.body, coords: { clientY: 80 } })

    expect(onResize).toHaveBeenCalledWith(-20)
  })

  it('cleans up on mouse up', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientY: 100 } })
    expect(document.body.style.cursor).toBe('row-resize')

    await user.pointer({ target: document.body, keys: '[/MouseLeft]' })

    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  it('does not respond to mouse move after mouse up', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientY: 100 } })
    await user.pointer({ target: document.body, coords: { clientY: 120 } })
    await user.pointer({ target: document.body, keys: '[/MouseLeft]' })

    onResize.mockClear()
    await user.pointer({ target: document.body, coords: { clientY: 150 } })

    expect(onResize).not.toHaveBeenCalled()
  })

  it('handles multiple drag sessions', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    render(<ResizableDivider onResize={onResize} />)
    const separator = screen.getByRole('separator')

    // First drag session
    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientY: 100 } })
    await user.pointer({ target: document.body, coords: { clientY: 120 } })
    await user.pointer({ target: document.body, keys: '[/MouseLeft]' })

    // Second drag session
    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientY: 200 } })
    await user.pointer({ target: document.body, coords: { clientY: 230 } })
    await user.pointer({ target: document.body, keys: '[/MouseLeft]' })

    expect(onResize).toHaveBeenCalledTimes(2)
    expect(onResize).toHaveBeenNthCalledWith(1, 20)
    expect(onResize).toHaveBeenNthCalledWith(2, 30)
  })

  it('cleans up event listeners on unmount during drag', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    const { unmount } = render(<ResizableDivider onResize={onResize} />)

    const separator = screen.getByRole('separator')
    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientY: 100 } })
    unmount()

    await user.pointer({ target: document.body, coords: { clientY: 150 } })
    expect(onResize).not.toHaveBeenCalled()
  })
})
