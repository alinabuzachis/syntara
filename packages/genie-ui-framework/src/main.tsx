import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuItem,
  MenuItems,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from ".";
import "./main.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="flex p-8">
      <Menu>
        <MenuTrigger>Menu</MenuTrigger>
        <MenuItems>
          <MenuItem onClick={() => alert("Item 1 clicked")}>Item 1</MenuItem>
          <MenuItem onClick={() => alert("Item 2 clicked")}>Item 2</MenuItem>
          <MenuSeparator />
          <MenuGroup label="Options">
            <MenuCheckboxItem
              checked={true}
              onCheckedChange={(checked) => console.log("Checkbox 1:", checked)}
            >
              Checkbox 1
            </MenuCheckboxItem>
            <MenuCheckboxItem
              checked={false}
              onCheckedChange={(checked) => console.log("Checkbox 2:", checked)}
            >
              Checkbox 2
            </MenuCheckboxItem>
          </MenuGroup>
          <MenuSeparator />
          <MenuRadioGroup
            value="option1"
            onValueChange={(value) => console.log("Selected Radio:", value)}
          >
            <MenuRadioItem value="option1">Option 1</MenuRadioItem>
            <MenuRadioItem value="option2">Option 2</MenuRadioItem>
            <MenuRadioItem value="option3">Option 3</MenuRadioItem>
          </MenuRadioGroup>
        </MenuItems>
      </Menu>
    </div>
  </StrictMode>
);
