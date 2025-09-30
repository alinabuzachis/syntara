import { BellIcon, CircleQuestionMarkIcon, ListTodoIcon } from "lucide-react";

export function AppRightBar() {
  return (
    <div className="grow-0 self-center flex flex-col py-1 text-white/60 glass rounded-full border mx-8">
      <button className="p-3">
        <BellIcon />
      </button>
      <button className="p-3">
        <ListTodoIcon />
      </button>
      <button className="p-3">
        <CircleQuestionMarkIcon />
      </button>
    </div>
  );
}
