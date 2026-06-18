import { Link as TanStackLink } from '@tanstack/react-router'
import { type ComponentProps } from 'react'
import { Link as WouterLink } from 'wouter'

import { isTanStackRouter } from '../../app/routerFlag'

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
}

type TanStackTo = ComponentProps<typeof TanStackLink>['to']

function WouterLinkAdapter({ href, ...rest }: Readonly<LinkProps>) {
  return <WouterLink href={href} {...rest} />
}

function TanStackLinkAdapter({ href, children, ...rest }: Readonly<LinkProps>) {
  // Route path type-safety for Link is deferred to the TanStack-shaped bridge
  // migration (Phase 4). href comes from our AppRoute constants so it is always
  // a valid registered route at runtime.
  return (
    <TanStackLink to={href as TanStackTo} {...(rest as Omit<ComponentProps<typeof TanStackLink>, 'to' | 'children'>)}>
      {children}
    </TanStackLink>
  )
}

/**
 * Routing bridge: anchor-based navigation link accepting `href` and standard anchor attributes.
 *
 * Delegates to wouter or TanStack Router depending on the `nexus-ui-router`
 * localStorage flag. The implementation never changes at runtime — a page
 * reload is required to switch routers.
 */
export const Link = isTanStackRouter() ? TanStackLinkAdapter : WouterLinkAdapter
