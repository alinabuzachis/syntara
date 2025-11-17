import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { XIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from './Button'
import { Scrollable } from './Scrollable'

type PanelWidth = 'sm' | 'md' | 'lg' | 'xl'
type PanelSide = 'left' | 'right'

interface SidePanelProps {
  onClose: () => void
  title: string
  icon?: LucideIcon
  width?: PanelWidth
  side?: PanelSide
  children: ReactNode
  className?: string
  /** Custom text size class for content (defaults to panel's default) */
  textSize?: string
  /** Whether to include padding in the scrollable area (defaults to true) */
  scrollablePadding?: boolean
}

const widthClasses: Record<PanelWidth, string> = {
  sm: 'w-64',
  md: 'w-80',
  lg: 'w-96',
  xl: 'w-[32rem]',
}

/**
 * SidePanel component for displaying content in a side panel with a header and scrollable content.
 * Supports different widths, sides, and customization options.
 */
export function SidePanel(props: SidePanelProps) {
  const {
    onClose,
    title,
    icon: Icon,
    width = 'md',
    side = 'right',
    children,
    className,
    textSize,
    scrollablePadding = true,
  } = props

  const widthClass = widthClasses[width]
  const animationClass =
    side === 'left' ? 'animate-in slide-in-from-left duration-300' : 'animate-in slide-in-from-right duration-300'

  return (
    <div
      className={clsx(
        'glass flex max-h-full flex-shrink-0 flex-col gap-4 rounded-4xl border-2 py-6',
        widthClass,
        animationClass,
        className
      )}
    >
      <header className="flex items-center justify-between px-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {Icon && <Icon className="size-5" />}
          {title}
        </h2>
        <Button variant="plain" onClick={onClose} className="p-1">
          <XIcon className="size-4" />
        </Button>
      </header>

      <Scrollable className={clsx(scrollablePadding && 'px-6', textSize)}>{children}</Scrollable>
    </div>
  )
}
