import { ScrollArea } from "@base-ui-components/react";
import clsx from "clsx";

export function Scrollable(props: {
  children?: React.ReactNode;
  className?: string;
  render?: React.ReactElement<Record<string, unknown>>;
}) {
  return (
    <ScrollArea.Root
      className={clsx("overflow-hidden flex-1", props.className)}
    >
      <ScrollArea.Viewport
        className="h-full overscroll-contain rounded-md"
        render={props.render}
      >
        {props.children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="mx-3 my-4 z-20 flex w-2 justify-center rounded opacity-0 transition-opacity delay-300 data-[hovering]:opacity-100 data-[hovering]:delay-0 data-[hovering]:duration-75 data-[scrolling]:opacity-100 data-[scrolling]:delay-0 data-[scrolling]:duration-75">
        <ScrollArea.Thumb className="w-full rounded bg-violet-500/40" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
