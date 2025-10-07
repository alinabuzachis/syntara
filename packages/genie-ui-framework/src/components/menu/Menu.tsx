import { Menu as BaseMenu } from "@base-ui-components/react/menu";

export function Menu({ children }: { children?: React.ReactNode }) {
  return <BaseMenu.Root>{children}</BaseMenu.Root>;
}

export function MenuTrigger(props: BaseMenu.Trigger.Props) {
  return <BaseMenu.Trigger {...props} className="menu-trigger" />;
}

export function MenuItem(props: BaseMenu.Item.Props) {
  return <BaseMenu.Item {...props} className="menu-item" />;
}

export function MenuCheckboxItem(props: BaseMenu.CheckboxItem.Props) {
  return <BaseMenu.CheckboxItem {...props} className="menu-item" />;
}

export function MenuRadioGroup(props: BaseMenu.RadioGroup.Props) {
  return <BaseMenu.RadioGroup {...props} className="menu-radio-group" />;
}

export function MenuRadioItem(props: BaseMenu.RadioItem.Props) {
  return <BaseMenu.RadioItem {...props} className="menu-item" />;
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

export function MenuItems({ children }: { children?: React.ReactNode }) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Backdrop className="menu-backdrop" />
      <BaseMenu.Positioner>
        <BaseMenu.Popup>{children}</BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

// function MenuExample() {
//   return (
//     <Menu>
//       <MenuTrigger>Open Menu</MenuTrigger>
//       <MenuItems>
//         <MenuItem onClick={() => alert("Item 1 clicked")}>Item 1</MenuItem>
//         <MenuItem onClick={() => alert("Item 2 clicked")}>Item 2</MenuItem>
//         <MenuSeparator />
//         <MenuGroup label="Options">
//           <MenuCheckboxItem
//             checked={true}
//             onCheckedChange={(checked) => console.log("Checkbox 1:", checked)}
//           >
//             Checkbox 1
//           </MenuCheckboxItem>
//           <MenuCheckboxItem
//             checked={false}
//             onCheckedChange={(checked) => console.log("Checkbox 2:", checked)}
//           >
//             Checkbox 2
//           </MenuCheckboxItem>
//         </MenuGroup>
//         <MenuSeparator />
//         <MenuRadioGroup
//           value="option1"
//           onValueChange={(value) => console.log("Selected Radio:", value)}
//         >
//           <MenuRadioItem value="option1">Option 1</MenuRadioItem>
//           <MenuRadioItem value="option2">Option 2</MenuRadioItem>
//           <MenuRadioItem value="option3">Option 3</MenuRadioItem>
//         </MenuRadioGroup>
//       </MenuItems>
//     </Menu>
//   );
// }
