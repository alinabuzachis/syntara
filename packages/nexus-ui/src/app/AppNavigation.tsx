import { useLocation } from 'wouter'
import { NavItem } from '../components/nav/NavItem'
import { navigationItems } from './navigationItems'

export function AppNavigation() {
  const [location] = useLocation()
  const activeTopLevel = location.split('/')[1]
  const visibleItems = navigationItems.filter((item) => !item.hidden)
  const activeTopNavItem = visibleItems.find((item) => item.path.startsWith('/' + activeTopLevel + '/'))
  return (
    <div className="z-10 flex flex-col items-center gap-2">
      <div className="glass flex justify-center rounded-full px-6 py-1">
        {visibleItems.map((item) => (
          <NavItem
            key={item.label}
            to={item.path}
            label={item.label}
            disabled={!item.element && !item.children?.length}
            matchPattern={item.matchPattern}
          />
        ))}
      </div>
      {activeTopNavItem?.children && (
        <div className="glass flex justify-center rounded-full px-4">
          {activeTopNavItem.children
            .filter((child) => !child.hidden)
            .map((item) => (
              <NavItem key={item.label} to={item.path} label={item.label} disabled={!item.element} />
            ))}
        </div>
      )}
    </div>
  )
}
