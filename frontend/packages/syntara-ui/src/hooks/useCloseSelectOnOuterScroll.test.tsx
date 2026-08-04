import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCloseSelectOnOuterScroll } from './useCloseSelectOnOuterScroll'

function TestSelect({ onClose }: Readonly<{ onClose?: () => void }>) {
  const [isOpen, setIsOpen] = useState(false)
  const anchorRef = useCloseSelectOnOuterScroll(isOpen, () => {
    setIsOpen(false)
    onClose?.()
  })

  return (
    <div ref={anchorRef}>
      <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        Toggle
      </button>
      {isOpen ? (
        <div className="pf-v6-c-menu" role="listbox">
          <div className="pf-v6-c-menu__content" style={{ maxHeight: 80, overflow: 'auto' }}>
            <button type="button" role="option" aria-selected="false">
              Option 1
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

describe('useCloseSelectOnOuterScroll', () => {
  let now = 1_000

  beforeEach(() => {
    now = 1_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('closes when wheel happens outside the menu', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <div>
        <TestSelect onClose={onClose} />
        <p>Outside</p>
      </div>
    )

    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    act(() => {
      screen.getByText('Outside').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }))
    })

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when wheel happens inside the menu', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TestSelect onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    const menu = screen.getByRole('listbox')

    act(() => {
      menu.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }))
    })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('attaches scroll listeners to scrollable ancestors and closes on scroll', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    const scrollParent = document.createElement('div')
    Object.defineProperty(scrollParent, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollParent, 'clientHeight', { value: 300, configurable: true })
    const addEventSpy = vi.spyOn(scrollParent, 'addEventListener')

    const renderTarget = document.createElement('div')
    scrollParent.appendChild(renderTarget)
    document.body.appendChild(scrollParent)

    render(
      <div>
        <TestSelect onClose={onClose} />
        <button type="button">Outside focus</button>
      </div>,
      { container: renderTarget }
    )

    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    expect(addEventSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })

    // Move focus outside the select UI so open/focus guards do not suppress dismiss.
    await user.click(screen.getByRole('button', { name: 'Outside focus' }))
    act(() => {
      now = 2_000
      scrollParent.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
    expect(onClose).toHaveBeenCalled()

    document.body.removeChild(scrollParent)
  })

  it('does not close on window scroll when focus is inside the menu (keyboard nav)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TestSelect onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    const option = screen.getByRole('option', { name: 'Option 1' })
    option.focus()

    act(() => {
      now = 2_000
      window.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not close on window scroll when focus is still on the toggle', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TestSelect onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    expect(screen.getByRole('button', { name: 'Toggle' })).toHaveFocus()

    act(() => {
      now = 2_000
      window.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not close on scroll immediately after open (menu positioning)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <div>
        <TestSelect onClose={onClose} />
        <button type="button">Outside focus</button>
      </div>
    )

    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    await user.click(screen.getByRole('button', { name: 'Outside focus' }))
    act(() => {
      // Still within OPEN_SCROLL_IGNORE_MS of the mocked open time (1000).
      now = 1_200
      window.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not close on chained window scroll after wheel inside the menu', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TestSelect onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    const menu = screen.getByRole('listbox')

    act(() => {
      now = 2_000
      menu.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }))
      window.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when touchmove happens outside the menu', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <div>
        <TestSelect onClose={onClose} />
        <p>Outside</p>
      </div>
    )

    await user.click(screen.getByRole('button', { name: 'Toggle' }))

    act(() => {
      screen.getByText('Outside').dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true }))
    })

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when the menu list itself scrolls', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TestSelect onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    const menu = screen.getByRole('listbox')

    act(() => {
      now = 2_000
      menu.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('attaches scroll listeners to horizontally scrollable ancestors', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    const scrollParent = document.createElement('div')
    Object.defineProperty(scrollParent, 'scrollWidth', { value: 500, configurable: true })
    Object.defineProperty(scrollParent, 'clientWidth', { value: 300, configurable: true })
    Object.defineProperty(scrollParent, 'scrollHeight', { value: 100, configurable: true })
    Object.defineProperty(scrollParent, 'clientHeight', { value: 100, configurable: true })
    const addEventSpy = vi.spyOn(scrollParent, 'addEventListener')

    const renderTarget = document.createElement('div')
    scrollParent.appendChild(renderTarget)
    document.body.appendChild(scrollParent)

    render(
      <div>
        <TestSelect onClose={onClose} />
        <button type="button">Outside focus</button>
      </div>,
      { container: renderTarget }
    )

    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    expect(addEventSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })

    await user.click(screen.getByRole('button', { name: 'Outside focus' }))
    act(() => {
      now = 2_000
      scrollParent.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
    expect(onClose).toHaveBeenCalled()

    document.body.removeChild(scrollParent)
  })

  it('uses the latest onClose callback after it changes', async () => {
    const user = userEvent.setup()
    const firstClose = vi.fn()
    const secondClose = vi.fn()
    const { rerender } = render(
      <div>
        <TestSelect onClose={firstClose} />
        <p>Outside</p>
      </div>
    )

    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    rerender(
      <div>
        <TestSelect onClose={secondClose} />
        <p>Outside</p>
      </div>
    )

    act(() => {
      screen.getByText('Outside').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }))
    })

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
    expect(firstClose).not.toHaveBeenCalled()
    expect(secondClose).toHaveBeenCalled()
  })
})
