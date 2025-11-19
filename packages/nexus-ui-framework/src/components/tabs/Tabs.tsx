import { Tabs as BaseTabs } from '@base-ui-components/react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

export interface TabItem {
  value: string
  label: string
  content: ReactNode
}

export interface TabsProps {
  tabs: TabItem[]
  defaultValue?: string
  className?: string
}

export function Tabs(props: TabsProps) {
  const { tabs, defaultValue, className } = props

  return (
    <BaseTabs.Root defaultValue={defaultValue ?? tabs[0]?.value} className={clsx('flex flex-col gap-4', className)}>
      <BaseTabs.List className="flex gap-1 border-b border-white/10">
        {tabs.map((tab) => (
          <BaseTabs.Tab
            key={tab.value}
            value={tab.value}
            className={clsx(
              'cursor-pointer border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors',
              'hover:text-blue-400',
              'data-[selected]:border-blue-500 data-[selected]:text-blue-400'
            )}
          >
            {tab.label}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>

      {tabs.map((tab) => (
        <BaseTabs.Panel key={tab.value} value={tab.value} className="flex-1 overflow-auto">
          {tab.content}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  )
}
