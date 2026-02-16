import { Icon } from '@patternfly/react-core'
import type { IconSize } from '@patternfly/react-core'
import type { ComponentType, CSSProperties, ReactNode } from 'react'

export type NodeIconVariant = 'canvas' | 'list' | 'header'

export function renderNodeIcon(
  IconComponent?: ComponentType,
  nodeId?: string,
  variant: NodeIconVariant = 'canvas'
): ReactNode | undefined {
  if (!IconComponent) return undefined

  const isCustomIcon = nodeId === 'aap'
  const shouldRotateIcon = nodeId === 'logic-condition' || nodeId === 'logic-converge'
  const variantConfig: Record<
    NodeIconVariant,
    { size: IconSize; iconSize: IconSize; customIconScale: number; customIconOffsetY: number }
  > = {
    canvas: { size: 'md', iconSize: 'md', customIconScale: 1.8, customIconOffsetY: 0 },
    list: { size: 'xl', iconSize: 'xl', customIconScale: 1.5, customIconOffsetY: 0 },
    header: { size: 'xl', iconSize: 'xl', customIconScale: 1.8, customIconOffsetY: 1 },
  }
  const { size, iconSize, customIconScale, customIconOffsetY } = variantConfig[variant]

  return (
    <Icon size={size} iconSize={iconSize} style={shouldRotateIcon ? { transform: 'rotate(90deg)' } : undefined}>
      {isCustomIcon ? (
        (() => {
          const StyledIcon = IconComponent as ComponentType<{ style?: CSSProperties }>
          return (
            <StyledIcon
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                transform: `translateY(${customIconOffsetY}px) scale(${customIconScale})`,
                transformOrigin: 'center',
              }}
            />
          )
        })()
      ) : (
        <IconComponent />
      )}
    </Icon>
  )
}
