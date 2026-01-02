import { CompassPanel, Stack, StackItem, Title, TitleSizes } from '@patternfly/react-core'
import type { ReactNode } from 'react'

export function AppLogin(props: { children?: ReactNode }) {
  const isLoggedIn = true
  if (!isLoggedIn) {
    return (
      <>
        {props.children}
        <CompassPanel>
          <Stack hasGutter>
            <StackItem>
              <Title headingLevel="h1" size={TitleSizes['2xl']}>
                Please log in to continue
              </Title>
            </StackItem>
          </Stack>
        </CompassPanel>
      </>
    )
  }
  return props.children
}
