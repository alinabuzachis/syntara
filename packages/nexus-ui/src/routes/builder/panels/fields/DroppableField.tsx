import { useDropTarget } from '../../../../hooks/useDropTarget'
import { DROP_TARGET_OUTLINE_ROUNDED } from '../utils/dragTypes'

type DroppableFieldProps = {
  children: React.ReactNode
  onDropText: (text: string) => void
}

/**
 * Wraps any form field to make it a drop target for text data.
 * When text/plain data is dropped, calls onDropText with the dropped text.
 * Shows a blue outline highlight during drag-over for visual feedback.
 */
function DroppableField({ children, onDropText }: Readonly<DroppableFieldProps>) {
  const { isDropTarget, handleDragOver, handleDragLeave, handleDrop } = useDropTarget({ onDropText })

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag-and-drop target wrapper
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={isDropTarget ? DROP_TARGET_OUTLINE_ROUNDED : undefined}
    >
      {children}
    </div>
  )
}

export { DroppableField }
export type { DroppableFieldProps }
