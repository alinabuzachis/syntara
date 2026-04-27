import { CompassMainHeader, Flex, Title } from '@patternfly/react-core'

export function AppPageHeader(props: { title: React.ReactNode; children?: React.ReactNode }) {
  const titleContent = typeof props.title === 'string' ? <Title headingLevel="h1">{props.title}</Title> : props.title

  return (
    <CompassMainHeader
      compassPanelProps={{ isGlass: true }}
      title={titleContent}
      toolbar={
        props.children ? (
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
            {props.children}
          </Flex>
        ) : undefined
      }
    />
  )
}
