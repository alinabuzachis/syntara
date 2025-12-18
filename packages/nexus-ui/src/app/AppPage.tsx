import { Stack } from '@patternfly/react-core'

export function AppPage(props: { children: React.ReactNode }) {
  return <Stack hasGutter>{props.children}</Stack>
}
