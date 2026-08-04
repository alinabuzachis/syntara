import { useCallback, useState } from 'react'

type UseDropTargetOptions = {
  /** Called when valid text data is dropped. */
  onDropText: (text: string) => void
}

type UseDropTargetResult = {
  /** Whether the element is currently an active drop target. */
  isDropTarget: boolean
  /** Attach to the wrapper element's `onDragOver`. */
  handleDragOver: (e: React.DragEvent) => void
  /** Attach to the wrapper element's `onDragLeave`. */
  handleDragLeave: () => void
  /** Attach to the wrapper element's `onDrop`. */
  handleDrop: (e: React.DragEvent) => void
}

/**
 * Shared drag-and-drop target logic.
 *
 * Manages drag-over highlight state and extracts `text/plain` from a drop
 * event that also carries `application/json` (the convention used by the
 * input panel's draggable fields).
 *
 * Used by `DroppableField` (form fields) and `ExpandableCodeEditor` (Monaco).
 */
function useDropTarget({ onDropText }: UseDropTargetOptions): UseDropTargetResult {
  const [isDropTarget, setIsDropTarget] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDropTarget(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDropTarget(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDropTarget(false)
      const json = e.dataTransfer.getData('application/json')
      if (!json) return
      const text = e.dataTransfer.getData('text/plain')
      if (text) {
        onDropText(text)
      }
    },
    [onDropText]
  )

  return { isDropTarget, handleDragOver, handleDragLeave, handleDrop }
}

export { useDropTarget }
export type { UseDropTargetOptions, UseDropTargetResult }
