import clsx from 'clsx'
import { Link, useRoute } from 'wouter'

export function NavItem(props: { to: string; label: string; disabled?: boolean }) {
  // const [isActiveParent] = useRoute(props.to + "/*");
  const [isActive] = useRoute(props.to)
  const reallyActive = isActive
  return (
    <Link
      href={props.disabled ? '' : props.to}
      className={clsx('px-4 py-2 transition', {
        'text-white/60': !props.disabled && !reallyActive,
        '-mb-0.5 border-b-2 border-sky-500/50 text-white': !props.disabled && reallyActive,
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
}
