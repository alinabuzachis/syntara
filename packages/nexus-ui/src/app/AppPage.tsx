import { Stack } from '@patternfly/react-core'

/** Fills `CompassContent` (last child gets `flex-grow` in Compass CSS) so `StackItem isFilled` + `AppPanel` heights resolve. */
export function AppPage(props: { children: React.ReactNode }) {
  return (
    <Stack hasGutter style={{ flex: 1, minHeight: 0 }}>
      {props.children}
    </Stack>
  )
}
