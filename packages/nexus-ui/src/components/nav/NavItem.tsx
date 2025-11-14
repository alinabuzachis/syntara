import clsx from 'clsx'
import { Link, useRoute } from 'wouter'

export function NavItem(props: { to: string; label: string; disabled?: boolean; matchPattern?: string }) {
  const [isActive] = useRoute(props.to)
  const [isPatternMatch] = useRoute(props.matchPattern || '')
  const reallyActive = isActive || (props.matchPattern && isPatternMatch)
  return (
    <Link
      href={props.disabled ? '' : props.to}
      className={clsx('relative px-4 py-2 transition', {
        'text-white/60': !props.disabled && !reallyActive,
        'text-white after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-8 after:-translate-x-1/2 after:rounded-full after:bg-white':
          !props.disabled && reallyActive,
        'text-violet-300 opacity-30': props.disabled,
      })}
    >
      {props.label}
    </Link>
  )
}

export type INavigationItem = {
  label: string
  path: string
  element?: React.ReactNode
  children?: INavigationItem[]
  hidden?: boolean // Hide from navigation but keep for routing
  matchPattern?: string // Optional pattern to match for active state (e.g., "/automation-builder/:workflowId")
}
