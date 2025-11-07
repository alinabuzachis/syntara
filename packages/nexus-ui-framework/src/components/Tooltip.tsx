import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip'
import type { ReactNode } from 'react'

export interface TooltipProps {
  children: ReactNode
  content: string
  delay?: number
}

export function Tooltip({ children, content, delay = 600 }: TooltipProps) {
  return (
    <BaseTooltip.Provider delay={delay}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger
          render={(props) => (
            <span {...props} style={{ display: 'inline-block' }}>
              {children}
            </span>
          )}
        />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner sideOffset={8}>
            <BaseTooltip.Popup className="glass rounded-lg border border-white/20 px-3 py-2 text-xs text-white shadow-lg">
              {content}
              <BaseTooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-8px] data-[side=right]:left-[-8px] data-[side=top]:bottom-[-4px]" />
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  )
}
