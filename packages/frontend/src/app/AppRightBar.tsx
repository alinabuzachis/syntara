import { BellIcon, CircleQuestionMarkIcon, ListTodoIcon } from "lucide-react";
import { IconButton } from "ui-framework";

export function AppRightBar() {
  return (
    <div className="grow-0 self-center flex flex-col py-1 text-white/60 glass rounded-full border mx-8">
      <IconButton>
        <BellIcon />
      </IconButton>

      <IconButton>
        <ListTodoIcon />
      </IconButton>

      <IconButton>
        <CircleQuestionMarkIcon />
      </IconButton>
    </div>
  );
}
