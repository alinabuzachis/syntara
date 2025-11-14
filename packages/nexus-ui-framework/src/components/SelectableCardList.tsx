import type { ReactNode } from 'react'

interface SelectableCardListProps {
  /** The items to display in the list */
  children: ReactNode
  /** Spacing between items (Tailwind gap class) */
  gap?: 'gap-1' | 'gap-1.5' | 'gap-2' | 'gap-3' | 'gap-4'
  /** Additional CSS classes */
  className?: string
}

/**
 * A container for a list of selectable cards.
 * Provides consistent spacing and layout.
 */
export function SelectableCardList(props: SelectableCardListProps) {
  const { children, gap = 'gap-1.5', className } = props

  return <div className={`flex flex-col ${gap} ${className || ''}`}>{children}</div>
}
