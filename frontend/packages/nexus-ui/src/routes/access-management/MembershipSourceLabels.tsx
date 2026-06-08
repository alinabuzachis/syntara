import { Flex, FlexItem, Label } from '@patternfly/react-core'

import type { MembershipSourceInfo } from './membershipSourceUtils'

export function MembershipSourceLabels({ sources }: Readonly<{ sources?: MembershipSourceInfo[] }>) {
  if (!sources || sources.length === 0) return null
  return (
    <Flex gap={{ default: 'gapXs' }} flexWrap={{ default: 'wrap' }}>
      {sources.map((s, idx) => (
        <FlexItem key={`${s.type}-${s.provider_name ?? idx}`}>
          <Label isCompact color={s.type === 'idp' ? 'blue' : 'grey'}>
            {s.type === 'idp' ? (s.provider_name ?? 'IdP') : 'Manual'}
          </Label>
        </FlexItem>
      ))}
    </Flex>
  )
}
