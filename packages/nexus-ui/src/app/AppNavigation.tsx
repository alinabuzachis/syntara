import { useLocation } from 'wouter'
import { NavItem } from '../components/nav/NavItem'
import { navigationItems } from './navigationItems'

export function AppNavigation() {
  const [location] = useLocation()
  const activeTopLevel = location.split('/')[1]
  const activeTopNavItem = navigationItems.find((item) => item.path.startsWith('/' + activeTopLevel + '/'))
  return (
    <div className="z-10 flex flex-col items-center gap-2">
      <div className="glass flex justify-center rounded-full px-6 py-1">
        {navigationItems.map((item) => (
          <NavItem
            key={item.label}
            to={item.path}
            label={item.label}
            disabled={!item.element && !item.children?.length}
          />
        ))}
      </div>
      {activeTopNavItem?.children && (
        <div className="glass flex justify-center rounded-full px-4">
          {activeTopNavItem.children.map((item) => (
            <NavItem key={item.label} to={item.path} label={item.label} disabled={!item.element} />
          ))}
        </div>
      )}
    </div>
  )
}
