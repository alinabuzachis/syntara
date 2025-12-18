import { Stack } from '@patternfly/react-core'

export function NodeSidePanel(props: { children: React.ReactNode }) {
  return (
    <Stack
      hasGutter
      style={{
        padding: 'var(--pf-t--global--spacer--2xl)',
      }}
    >
      {props.children}
    </Stack>
  )
}
