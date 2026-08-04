import { useNavigate, useRouterState } from '@tanstack/react-router'

import { detachPromise } from '../utils/detachPromise'

export function useUrlTab<T extends string = string>(
  basePath: string,
  defaultTab: NoInfer<T> = 'details' as T
): [T, (tab: T) => void] {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()

  const rest = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : ''
  const tabSlug = (rest.split('/').find(Boolean) ?? defaultTab) as T

  const goToTab = (tab: T) => {
    detachPromise(navigate({ to: `${basePath}/${tab}` }))
  }

  return [tabSlug, goToTab]
}
