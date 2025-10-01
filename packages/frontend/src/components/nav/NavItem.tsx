import clsx from "clsx";
import { Link, useRoute } from "wouter";

export function NavItem(props: {
  to: string;
  label: string;
  disabled?: boolean;
}) {
  // const [isActiveParent] = useRoute(props.to + "/*");
  const [isActive] = useRoute(props.to);
  const reallyActive = isActive;
  return (
    <Link
      href={props.disabled ? "" : props.to}
      className={clsx("transition px-4 py-2", {
        "text-white/60": !props.disabled && !reallyActive,
        "text-white border-b-2 border-sky-500/50 -mb-0.5":
          !props.disabled && reallyActive,
        "opacity-30 text-violet-300": props.disabled,
      })}
    >
      {props.label}
    </Link>
  );
}

export type INavigationItem = {
  label: string;
  path: string;
  element?: React.ReactNode;
  children?: INavigationItem[];
};
