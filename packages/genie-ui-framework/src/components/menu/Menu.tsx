import { Menu as BaseMenu } from "@base-ui-components/react";

export function Menu({ children }: { children?: React.ReactNode }) {
  return <BaseMenu.Root>{children}</BaseMenu.Root>;
}

export function MenuTrigger(props: BaseMenu.Trigger.Props) {
  return <BaseMenu.Trigger {...props} className="menu-trigger" />;
}

export function MenuItems({ children }: { children?: React.ReactNode }) {
  return (
    <BaseMenu.Portal>
      {/* <BaseMenu.Backdrop className="menu-backdrop" /> */}
      <BaseMenu.Positioner>
        <BaseMenu.Popup className="p-1 glass rounded-xl shadow-lg shadow-black/50">
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuItem(props: BaseMenu.Item.Props) {
  return (
    <BaseMenu.Item
      {...props}
      className="px-3 py-1.5 rounded-lg hover:bg-white/10"
    />
  );
}

export function MenuCheckboxItem(props: BaseMenu.CheckboxItem.Props) {
  return (
    <BaseMenu.CheckboxItem
      {...props}
      className="px-3 py-1.5 rounded-lg hover:bg-white/10"
    />
  );
}

export function MenuRadioGroup(props: BaseMenu.RadioGroup.Props) {
  return (
    <BaseMenu.RadioGroup
      {...props}
      className="grid grid-cols-[auto_1fr] gap-x-3"
    />
  );
}

export function MenuRadioItem(props: BaseMenu.RadioItem.Props) {
  const { children, ...rest } = props;
  return (
    <BaseMenu.RadioItem
      {...rest}
      className="px-3 py-1.5 rounded-lg hover:bg-white/10 data-[checked]:bg-violet-500/20 grid grid-cols-subgrid col-span-2"
    >
      <BaseMenu.RadioItemIndicator className="rounded-full bg-violet-400 w-2 h-2 self-center"></BaseMenu.RadioItemIndicator>
      <div className="col-start-2">{children}</div>
    </BaseMenu.RadioItem>
  );
}

export function MenuSeparator(props: BaseMenu.Separator.Props) {
  return (
    <BaseMenu.Separator
      {...props}
      className="border-t border-violet-300/20 my-1"
    />
  );
}

export function MenuGroup(props: BaseMenu.Group.Props & { label: string }) {
  return (
    <BaseMenu.Group {...props} className="pb-1">
      <BaseMenu.GroupLabel className="px-3 py-1.5 text-sm font-medium text-white/70">
        {props.label}
      </BaseMenu.GroupLabel>
      {props.children}
    </BaseMenu.Group>
  );
}
