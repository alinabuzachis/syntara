import { Flex, FlexItem } from '@patternfly/react-core'

/** Renders a page title with an inline project selector. */
export function PageTitleWithProject({
  title,
  projectSelector,
}: Readonly<{ title: string; projectSelector: React.ReactNode }>) {
  return (
    <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
      <FlexItem>
        <span style={{ fontSize: 'var(--pf-t--global--font--size--heading--h1)', fontWeight: 'bold' }}>{title}</span>
      </FlexItem>
      <FlexItem>{projectSelector}</FlexItem>
    </Flex>
  )
}
