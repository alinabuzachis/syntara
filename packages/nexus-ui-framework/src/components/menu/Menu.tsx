import { Menu as BaseMenu } from '@base-ui-components/react'

export function Menu({ children }: { children?: React.ReactNode }) {
  return <BaseMenu.Root>{children}</BaseMenu.Root>
}
