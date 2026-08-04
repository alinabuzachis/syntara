import { createRootRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { detachPromise } from '../../utils/detachPromise'
import { RootLayout } from '../RootLayout'

/** Catches unmatched URLs and redirects to /workflows via the router (preserving history). */
function NotFoundRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    detachPromise(navigate({ to: '/workflows', replace: true }))
  }, [navigate])
  return null
}

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundRedirect,
})
