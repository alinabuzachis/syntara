import { Flex, FlexItem, Title } from '@patternfly/react-core'

/** Renders a page title with an inline project selector. */
export function PageTitleWithProject({
  title,
  projectSelector,
}: Readonly<{ title: string; projectSelector: React.ReactNode }>) {
  return (
    <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
      <FlexItem>
        <Title headingLevel="h1">{title}</Title>
      </FlexItem>
      <FlexItem>{projectSelector}</FlexItem>
    </Flex>
  )
}
