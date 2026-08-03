import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ResizableColumnDivider } from './ResizableColumnDivider'

function renderDivider(props?: { currentValue?: number }) {
  const onResize = vi.fn()
  const onResizeEnd = vi.fn()
  const view = render(
    <ResizableColumnDivider onResize={onResize} onResizeEnd={onResizeEnd} aria-label="Resize panels" {...props} />
  )
  return { onResize, onResizeEnd, ...view }
}

describe('ResizableColumnDivider', () => {
  afterEach(() => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('renders without accessibility violations', async () => {
    const { container } = renderDivider()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has proper ARIA attributes with default value', () => {
    renderDivider()
    const slider = screen.getByRole('slider', { name: 'Resize panels' })
    expect(slider).toHaveAttribute('aria-valuenow', '33')
    expect(slider).toHaveAttribute('aria-valuemin', '15')
    expect(slider).toHaveAttribute('aria-valuemax', '85')
  })

  it('has proper ARIA attributes with custom value', () => {
    renderDivider({ currentValue: 50 })
    const separator = screen.getByRole('slider', { name: 'Resize panels' })
    expect(separator).toHaveAttribute('aria-valuenow', '50')
  })

  it('responds to keyboard arrow left', async () => {
    const user = userEvent.setup()
    const { onResize, onResizeEnd } = renderDivider()
    const separator = screen.getByRole('slider')

    separator.focus()
    await user.keyboard('{ArrowLeft}')

    expect(onResize).toHaveBeenCalledWith(-20)
    expect(onResizeEnd).toHaveBeenCalled()
  })

  it('responds to keyboard arrow right', async () => {
    const user = userEvent.setup()
    const { onResize, onResizeEnd } = renderDivider()
    const separator = screen.getByRole('slider')

    separator.focus()
    await user.keyboard('{ArrowRight}')

    expect(onResize).toHaveBeenCalledWith(20)
    expect(onResizeEnd).toHaveBeenCalled()
  })

  it('ignores other keyboard keys', async () => {
    const user = userEvent.setup()
    const { onResize } = renderDivider()
    const separator = screen.getByRole('slider')

    separator.focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')
    await user.keyboard('a')

    expect(onResize).not.toHaveBeenCalled()
  })

  it('initiates drag on mouse down', async () => {
    const user = userEvent.setup()
    renderDivider()
    const separator = screen.getByRole('slider')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientX: 100 } })

    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')
  })

  it('calls onResize during mouse drag', async () => {
    const user = userEvent.setup()
    const { onResize } = renderDivider()
    const separator = screen.getByRole('slider')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientX: 100 } })
    await user.pointer({ target: document.body, coords: { clientX: 120 } })

    expect(onResize).toHaveBeenCalledWith(20)
  })

  it('updates delta correctly on consecutive mouse moves', async () => {
    const user = userEvent.setup()
    const { onResize } = renderDivider()
    const separator = screen.getByRole('slider')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientX: 100 } })
    await user.pointer({ target: document.body, coords: { clientX: 120 } })
    await user.pointer({ target: document.body, coords: { clientX: 150 } })

    expect(onResize).toHaveBeenCalledTimes(2)
    expect(onResize).toHaveBeenNthCalledWith(1, 20)
    expect(onResize).toHaveBeenNthCalledWith(2, 30)
  })

  it('handles leftward mouse drag with negative delta', async () => {
    const user = userEvent.setup()
    const { onResize } = renderDivider()
    const separator = screen.getByRole('slider')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientX: 100 } })
    await user.pointer({ target: document.body, coords: { clientX: 80 } })

    expect(onResize).toHaveBeenCalledWith(-20)
  })

  it('calls onResizeEnd and cleans up on mouse up', async () => {
    const user = userEvent.setup()
    const { onResizeEnd } = renderDivider()
    const separator = screen.getByRole('slider')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientX: 100 } })
    expect(document.body.style.cursor).toBe('col-resize')

    await user.pointer({ target: document.body, keys: '[/MouseLeft]' })

    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
    expect(onResizeEnd).toHaveBeenCalled()
  })

  it('does not respond to mouse move after mouse up', async () => {
    const user = userEvent.setup()
    const { onResize } = renderDivider()
    const separator = screen.getByRole('slider')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientX: 100 } })
    await user.pointer({ target: document.body, coords: { clientX: 120 } })
    await user.pointer({ target: document.body, keys: '[/MouseLeft]' })

    onResize.mockClear()
    await user.pointer({ target: document.body, coords: { clientX: 150 } })

    expect(onResize).not.toHaveBeenCalled()
  })

  it('handles multiple drag sessions', async () => {
    const user = userEvent.setup()
    const { onResize, onResizeEnd } = renderDivider()
    const separator = screen.getByRole('slider')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientX: 100 } })
    await user.pointer({ target: document.body, coords: { clientX: 120 } })
    await user.pointer({ target: document.body, keys: '[/MouseLeft]' })

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientX: 200 } })
    await user.pointer({ target: document.body, coords: { clientX: 230 } })
    await user.pointer({ target: document.body, keys: '[/MouseLeft]' })

    expect(onResize).toHaveBeenCalledTimes(2)
    expect(onResize).toHaveBeenNthCalledWith(1, 20)
    expect(onResize).toHaveBeenNthCalledWith(2, 30)
    expect(onResizeEnd).toHaveBeenCalledTimes(2)
  })

  it('cleans up event listeners on unmount during drag', async () => {
    const user = userEvent.setup()
    const { onResize, unmount } = renderDivider()
    const separator = screen.getByRole('slider')

    await user.pointer({ target: separator, keys: '[MouseLeft>]', coords: { clientX: 100 } })
    unmount()

    await user.pointer({ target: document.body, coords: { clientX: 150 } })
    expect(onResize).not.toHaveBeenCalled()
  })
})
