import { useLocation } from './routing/useLocation'
import { useNavigate } from './routing/useNavigate'

export function useUrlTab<T extends string = string>(
  basePath: string,
  defaultTab: NoInfer<T> = 'details' as T
): [T, (tab: T) => void] {
  const location = useLocation()
  const setLocation = useNavigate()

  const rest = location.startsWith(basePath) ? location.slice(basePath.length) : ''
  const tabSlug = (rest.split('/').find(Boolean) ?? defaultTab) as T

  const goToTab = (tab: T) => {
    setLocation(`${basePath}/${tab}`)
  }

  return [tabSlug, goToTab]
}
