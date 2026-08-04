import { useCallback, useEffect, useRef } from 'react'

import styles from './ResizableColumnDivider.module.css'

const KEYBOARD_STEP = 20
const MIN_VALUE = 15
const MAX_VALUE = 85
const STEP_BY_KEY: Record<string, number> = { ArrowLeft: -KEYBOARD_STEP, ArrowRight: KEYBOARD_STEP }

type ResizableColumnDividerProps = {
  onResize: (deltaX: number) => void
  onResizeEnd: () => void
  currentValue?: number
  'aria-label': string
}

export function ResizableColumnDivider({
  onResize,
  onResizeEnd,
  currentValue = 33,
  'aria-label': ariaLabel,
}: Readonly<ResizableColumnDividerProps>) {
  const startXRef = useRef(0)
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
      startXRef.current = e.clientX
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const move = (ev: MouseEvent) => {
        const delta = ev.clientX - startXRef.current
        startXRef.current = ev.clientX
        onResize(delta)
      }
      const up = () => {
        cleanup()
        onResizeEnd()
      }

      handlersRef.current = { move, up }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    },
    [onResize, onResizeEnd, cleanup]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = STEP_BY_KEY[e.key]
      if (step !== undefined) {
        e.preventDefault()
        onResize(step)
        onResizeEnd()
      }
    },
    [onResize, onResizeEnd]
  )

  return (
    <div
      role="slider"
      aria-label={ariaLabel}
      aria-valuenow={currentValue}
      aria-valuemin={MIN_VALUE}
      aria-valuemax={MAX_VALUE}
      tabIndex={0}
      className={styles.divider}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.hoverTarget} />
    </div>
  )
}
