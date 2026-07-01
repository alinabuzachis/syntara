import { Link as TanStackLink } from '@tanstack/react-router'
import { type ComponentProps } from 'react'

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
}

type TanStackTo = ComponentProps<typeof TanStackLink>['to']

/**
 * Routing bridge: anchor-based navigation link accepting `href` and standard anchor attributes.
 *
 * Wraps TanStack Router's `<Link>` with the wouter-compatible `href` prop used
 * by all consumers. Route-level type-safety is deferred to the Phase 4 consumer
 * migration; `href` always comes from `AppRoute` constants so it is a valid
 * registered route at runtime.
 */
export function Link({ href, children, ...rest }: Readonly<LinkProps>) {
  return (
    <TanStackLink to={href as TanStackTo} {...(rest as Omit<ComponentProps<typeof TanStackLink>, 'to' | 'children'>)}>
      {children}
    </TanStackLink>
  )
}
