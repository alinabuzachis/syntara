import { ScrollArea } from '@base-ui-components/react'

export function CodeBlock(props: { children?: React.ReactNode; jsonObject?: object }) {
  return (
    <ScrollArea.Root className="max-h-96 overflow-hidden rounded-xl border border-black/40 bg-black/30">
      <ScrollArea.Viewport className="h-full overscroll-contain">
        <pre className="px-4 py-2 text-xs leading-6">
          {props.children ?? (props.jsonObject && JSON.stringify(props.jsonObject, undefined, 2))}
        </pre>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="z-20 mx-3 my-4 flex w-2 justify-center rounded opacity-0 transition-opacity delay-300 data-[hovering]:opacity-100 data-[hovering]:delay-0 data-[hovering]:duration-75 data-[scrolling]:opacity-100 data-[scrolling]:delay-0 data-[scrolling]:duration-75">
        <ScrollArea.Thumb className="w-full rounded bg-violet-500/40" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}
