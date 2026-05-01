import { useCallback, useEffect, useRef } from 'react'

const DIVIDER_STYLE: React.CSSProperties = {
  height: '6px',
  cursor: 'row-resize',
  background: 'var(--pf-t--global--border--color--default)',
  flexShrink: 0,
  position: 'relative',
  zIndex: 1,
  marginBlock: 'var(--pf-t--global--spacer--xs)',
  width: '20%',
  marginInline: 'auto',
  borderRadius: 'var(--pf-t--global--border--radius--small)',
}

const DIVIDER_HOVER_TARGET: React.CSSProperties = {
  position: 'absolute',
  top: '-3px',
  bottom: '-3px',
  left: 0,
  right: 0,
}

const KEYBOARD_STEP = 20
const MIN_VALUE = 0
const MAX_VALUE = 100

type ResizableDividerProps = {
  onResize: (deltaY: number) => void
  currentValue?: number
}

export function ResizableDivider({ onResize, currentValue = 50 }: Readonly<ResizableDividerProps>) {
  const startYRef = useRef(0)
  const handlersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null)

  const cleanup = useCallback(() => {
    if (handlersRef.current) {
      document.removeEventListener('mousemove', handlersRef.current.move)
      document.removeEventListener('mouseup', handlersRef.current.up)
      handlersRef.current = null
    }
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startYRef.current = e.clientY
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'

      const move = (ev: MouseEvent) => {
        const delta = ev.clientY - startYRef.current
        startYRef.current = ev.clientY
        onResize(delta)
      }
      const up = () => cleanup()

      handlersRef.current = { move, up }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    },
    [onResize, cleanup]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onResize(-KEYBOARD_STEP)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        onResize(KEYBOARD_STEP)
      }
    },
    [onResize]
  )

  return (
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- WAI-ARIA window splitter pattern: role="separator" with aria-valuenow/min/max requires tabIndex and keyboard/mouse handlers for resizing */
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize canvas and details panel"
      aria-valuenow={currentValue}
      aria-valuemin={MIN_VALUE}
      aria-valuemax={MAX_VALUE}
      tabIndex={0}
      style={DIVIDER_STYLE}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div style={DIVIDER_HOVER_TARGET} />
    </div>
  )
}
