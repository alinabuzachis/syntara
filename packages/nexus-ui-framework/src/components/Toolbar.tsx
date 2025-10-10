import { Toolbar as BaseToolbar } from "@base-ui-components/react";
import clsx from "clsx";

export function Toolbar(props: BaseToolbar.Root.Props) {
  return (
    <BaseToolbar.Root
      {...props}
      className={clsx("flex", props.className, {
        "flex-col": props.orientation === "vertical",
        "flex-row": props.orientation !== "vertical",
      })}
    />
  );
}

export function ToolbarButton(props: BaseToolbar.Button.Props) {
  return (
    <BaseToolbar.Button {...props} className={clsx("p-3", props.className)}>
      {props.children}
    </BaseToolbar.Button>
  );
}

export function ToolbarLink(props: BaseToolbar.Link.Props) {
  return <BaseToolbar.Link {...props} className={clsx(props.className)} />;
}

export function ToolbarSeparator(props: BaseToolbar.Separator.Props) {
  return <BaseToolbar.Separator {...props} className={clsx(props.className)} />;
}

export function ToolbarGroup(props: BaseToolbar.Group.Props) {
  return <BaseToolbar.Group {...props} className={clsx(props.className)} />;
}

export function ToolbarInput(props: BaseToolbar.Input.Props) {
  return <BaseToolbar.Input {...props} className={clsx(props.className)} />;
}
