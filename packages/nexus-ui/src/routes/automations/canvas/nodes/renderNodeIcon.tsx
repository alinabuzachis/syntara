import { Icon } from '@patternfly/react-core'
import type { IconSize } from '@patternfly/react-core'
import type { ComponentType, CSSProperties, ReactNode } from 'react'

import { RegistryNodeId } from '../../../../constants'

export type NodeIconVariant = 'canvas' | 'list' | 'header'

export function renderNodeIcon(
  IconComponent?: ComponentType,
  nodeId?: string,
  variant: NodeIconVariant = 'canvas',
  /** Optional color (e.g. PatternFly token) so icon matches node type accent; uses currentColor when unset */
  color?: string
): ReactNode | undefined {
  if (!IconComponent) return undefined

  const isCustomIcon = nodeId === RegistryNodeId.AAP
  const shouldRotateIcon = nodeId === RegistryNodeId.LOGIC_CONDITION || nodeId === RegistryNodeId.LOGIC_CONVERGE
  const variantConfig: Record<
    NodeIconVariant,
    { size: IconSize; iconSize: IconSize; customIconScale: number; customIconOffsetY: number }
  > = {
    canvas: { size: 'md', iconSize: 'md', customIconScale: 1.8, customIconOffsetY: 0 },
    list: { size: 'xl', iconSize: 'xl', customIconScale: 1.5, customIconOffsetY: 0 },
    header: { size: 'xl', iconSize: 'xl', customIconScale: 1.8, customIconOffsetY: 1 },
  }
  const { size, iconSize, customIconScale, customIconOffsetY } = variantConfig[variant]

  const iconStyle: CSSProperties = {
    ...(shouldRotateIcon && { transform: 'rotate(90deg)' }),
    ...(color && {
      color,
      // Override PatternFly Icon's inner content color so the SVG (fill: currentColor) picks it up
      ['--pf-v6-c-icon__content--Color' as string]: color,
    }),
  }

  return (
    <Icon
      data-testid="node-icon-wrapper"
      size={size}
      iconSize={iconSize}
      style={Object.keys(iconStyle).length > 0 ? iconStyle : undefined}
    >
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
