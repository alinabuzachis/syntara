import { useLocation } from 'wouter'

export function useDetailTab<T extends string = string>(
  basePath: string,
  defaultTab: NoInfer<T> = 'details' as T
): [T, (tab: T) => void] {
  const [location, setLocation] = useLocation()

  const rest = location.startsWith(basePath) ? location.slice(basePath.length) : ''
  const tabSlug = (rest.split('/').filter(Boolean)[0] ?? defaultTab) as T

  const goToTab = (tab: T) => {
    setLocation(`${basePath}/${tab}`)
  }

  return [tabSlug, goToTab]
}
