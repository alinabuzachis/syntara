import { Toolbar, ToolbarButton } from "@ansible/nexus-ui-framework";
import { BellIcon, CircleQuestionMarkIcon, ListTodoIcon } from "lucide-react";

export function AppRightBar() {
  return (
    <Toolbar
      orientation="vertical"
      className="glass rounded-full border mx-8 grow-0 self-center py-1"
    >
      <ToolbarButton>
        <BellIcon />
      </ToolbarButton>

      <ToolbarButton>
        <ListTodoIcon />
      </ToolbarButton>

      <ToolbarButton>
        <CircleQuestionMarkIcon />
      </ToolbarButton>
    </Toolbar>
  );
}
