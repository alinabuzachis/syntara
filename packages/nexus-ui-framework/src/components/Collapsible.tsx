import { Collapsible as BaseCollapsible } from '@base-ui-components/react/collapsible'
import clsx from 'clsx'

export function Collapsible(props: { collapsed?: boolean; children?: React.ReactNode; className?: string }) {
  return (
    <BaseCollapsible.Root className="flex flex-col justify-center" open={!props.collapsed}>
      <BaseCollapsible.Panel
        className={clsx(
          'flex h-[var(--collapsible-panel-height)] flex-col justify-end overflow-hidden transition-all ease-out data-[ending-style]:h-0 data-[starting-style]:h-0',
          props.className
        )}
      >
        {props.children}
      </BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  )
}
