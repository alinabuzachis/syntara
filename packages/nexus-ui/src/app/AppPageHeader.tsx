import {
  CompassMainHeader,
  CompassMainHeaderContent,
  CompassMainHeaderTitle,
  CompassMainHeaderToolbar,
  CompassPanel,
  Flex,
  Title,
} from '@patternfly/react-core'

export function AppPageHeader(props: {
  title: React.ReactNode
  breadcrumb?: React.ReactNode
  children?: React.ReactNode
}) {
  const titleContent = typeof props.title === 'string' ? <Title headingLevel="h1">{props.title}</Title> : props.title

  if (props.breadcrumb) {
    return (
      <CompassMainHeader>
        <CompassPanel>
          <div style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }} className="app-breadcrumb-no-underline">
            {props.breadcrumb}
          </div>
          <CompassMainHeaderContent>
            <CompassMainHeaderTitle>{titleContent}</CompassMainHeaderTitle>
            {props.children && (
              <CompassMainHeaderToolbar>
                <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
                  {props.children}
                </Flex>
              </CompassMainHeaderToolbar>
            )}
          </CompassMainHeaderContent>
        </CompassPanel>
      </CompassMainHeader>
    )
  }

  return (
    <CompassMainHeader
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
