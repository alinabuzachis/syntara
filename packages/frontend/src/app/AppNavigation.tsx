import { useLocation } from "wouter";
import { NavItem } from "../components/nav/NavItem";
import { navigationItems } from "./navigationItems";

export function AppNavigation() {
  const [location] = useLocation();
  const activeTopLevel = location.split("/")[1];
  const activeTopNavItem = navigationItems.find((item) =>
    item.path.startsWith("/" + activeTopLevel + "/")
  );
  return (
    <div className="flex flex-col gap-2 items-center">
      <div className="flex justify-center glass px-6 rounded-full py-1">
        {navigationItems.map((item) => (
          <NavItem key={item.label} to={item.path} label={item.label} />
        ))}
      </div>
      {activeTopNavItem?.children && (
        <div className="flex justify-center glass px-4 rounded-full">
          {activeTopNavItem.children.map((item) => (
            <NavItem key={item.label} to={item.path} label={item.label} />
          ))}
        </div>
      )}
    </div>
  );
}
