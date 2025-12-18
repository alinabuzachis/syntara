import { Flex } from '@patternfly/react-core'

export function NodeHeader(props: { children: React.ReactNode }) {
  return (
    <Flex
      alignItems={{ default: 'alignItemsCenter' }}
      justifyContent={{ default: 'justifyContentSpaceBetween' }}
      style={{
        padding: 'var(--pf-t--global--spacer--sm)',
      }}
    >
      {props.children}
    </Flex>
  )
}
