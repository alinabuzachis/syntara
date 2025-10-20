import { ScrollArea } from '@base-ui-components/react'
import clsx from 'clsx'

export function Scrollable(props: {
  children?: React.ReactNode
  className?: string
  render?: React.ReactElement<Record<string, unknown>>
  onScroll?: (options: { atTop?: boolean; atBottom?: boolean }) => void
}) {
  return (
    <ScrollArea.Root className={clsx('overflow-hidden', props.className)}>
      <ScrollArea.Viewport
        className="h-full overscroll-contain rounded-md"
        render={props.render}
        onScroll={(event) => {
          if (props.onScroll) {
            props.onScroll({
              atTop: event.currentTarget.scrollTop === 0,
              atBottom:
                event.currentTarget.scrollHeight - event.currentTarget.scrollTop === event.currentTarget.clientHeight,
            })
          }
        }}
      >
        {props.children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="z-20 mx-3 my-4 flex w-2 justify-center rounded opacity-0 transition-opacity delay-300 data-[hovering]:opacity-100 data-[hovering]:delay-0 data-[hovering]:duration-75 data-[scrolling]:opacity-100 data-[scrolling]:delay-0 data-[scrolling]:duration-75">
        <ScrollArea.Thumb className="w-full rounded bg-violet-500/40" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}
