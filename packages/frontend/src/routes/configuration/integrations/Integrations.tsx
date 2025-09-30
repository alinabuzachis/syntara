import clsx from "clsx";
import { AppPage } from "../../../app/AppPage";
import { AppPageHeader } from "../../../app/AppPageHeader";
import { ChatInput } from "../../../components/chat/ChatInput";

export default function Integrations() {
  return (
    <AppPage>
      <AppPageHeader title="Integrations" />
      <Scrollable className="glass rounded-3xl border">
        <div
          className={`p-8 grid gap-4 grid-cols-[repeat(auto-fit,minmax(250px,1fr))] `}
        >
          {new Array(30).fill(0).map((_, i) => (
            <div key={i} className="p-8 glass rounded-2xl border">
              <div>Integration {i + 1}</div>
              <div className="text-white/70">MCP Server</div>
            </div>
          ))}
        </div>
      </Scrollable>
      <ChatInput />
    </AppPage>
  );
}

import { ScrollArea } from "@base-ui-components/react/scroll-area";

export function Scrollable(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollArea.Root
      className={clsx("h-full w-full overflow-hidden", props.className)}
    >
      <ScrollArea.Viewport className="h-full overscroll-contain rounded-md">
        {props.children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="mx-3 my-4 flex w-2 justify-center rounded opacity-0 transition-opacity delay-300 data-[hovering]:opacity-100 data-[hovering]:delay-0 data-[hovering]:duration-75 data-[scrolling]:opacity-100 data-[scrolling]:delay-0 data-[scrolling]:duration-75">
        <ScrollArea.Thumb className="w-full rounded bg-violet-500/40" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
