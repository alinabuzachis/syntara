import { Menu as BaseMenu } from "@base-ui-components/react/menu";

export function Menu({ children }: { children?: React.ReactNode }) {
  return <BaseMenu.Root>{children}</BaseMenu.Root>;
}

export function MenuTrigger(props: BaseMenu.Trigger.Props) {
  return <BaseMenu.Trigger {...props} className="menu-trigger" />;
}

export function MenuItems({ children }: { children?: React.ReactNode }) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Backdrop className="menu-backdrop" />
      <BaseMenu.Positioner>
        <BaseMenu.Popup className="menu-popup">{children}</BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuItem(props: BaseMenu.Item.Props) {
  return <BaseMenu.Item {...props} className="menu-item" />;
}

export function MenuCheckboxItem(props: BaseMenu.CheckboxItem.Props) {
  return <BaseMenu.CheckboxItem {...props} className="menu-checkbox-item" />;
}

export function MenuRadioGroup(props: BaseMenu.RadioGroup.Props) {
  return <BaseMenu.RadioGroup {...props} className="menu-radio-group" />;
}

export function MenuRadioItem(props: BaseMenu.RadioItem.Props) {
  return <BaseMenu.RadioItem {...props} className="menu-radio-item" />;
}

export function MenuSeparator(props: BaseMenu.Separator.Props) {
  return <BaseMenu.Separator {...props} className="menu-separator" />;
}

export function MenuGroup(props: BaseMenu.Group.Props & { label: string }) {
  return (
    <BaseMenu.Group {...props} className="menu-group">
      <BaseMenu.GroupLabel className="menu-group-label">
        {props.label}
      </BaseMenu.GroupLabel>
      {props.children}
    </BaseMenu.Group>
  );
}
