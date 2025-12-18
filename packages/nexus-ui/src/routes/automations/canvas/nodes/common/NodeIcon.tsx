import { Flex } from '@patternfly/react-core'

export function NodeIcon(props: { children: React.ReactNode }) {
  return (
    <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ paddingRight: 'var(--pf-t--global--spacer--md)' }}>
      {props.children}
    </Flex>
  )
}
