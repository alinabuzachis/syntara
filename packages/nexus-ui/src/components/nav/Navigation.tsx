import clsx from 'clsx'
import type { ReactNode } from 'react'

export function Navigation(props: { children?: ReactNode; className?: string; size?: 'md' | 'lg' }) {
  return (
    <div
      className={clsx(
        'glass flex flex-row rounded-full border px-4',
        {
          '*:py-2': props.size === 'md' || !props.size,
          '*:py-3': props.size === 'lg',
        },
        props.className
      )}
    >
      {props.children}
    </div>
  )
}
