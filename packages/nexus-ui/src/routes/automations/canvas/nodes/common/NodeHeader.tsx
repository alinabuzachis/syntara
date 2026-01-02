import { Flex } from '@patternfly/react-core'

export function NodeHeader(props: { children: React.ReactNode }) {
  return (
    <div
      style={{
        paddingTop: 'var(--pf-t--global--spacer--md)',
        paddingLeft: 'var(--pf-t--global--spacer--md)',
        paddingRight: 'var(--pf-t--global--spacer--md)',
      }}
    >
      <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
        {props.children}
      </Flex>
    </div>
  )
}
