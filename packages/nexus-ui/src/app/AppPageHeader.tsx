import { CompassPanel, Flex, FlexItem, Title, TitleSizes } from '@patternfly/react-core'

export function AppPageHeader(props: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <CompassPanel>
      <Flex
        alignItems={{ default: 'alignItemsCenter' }}
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        flexWrap={{ default: 'wrap' }}
        gap={{ default: 'gapMd' }}
      >
        <FlexItem>
          {typeof props.title === 'string' ? (
            <Title headingLevel="h1" size={TitleSizes['2xl']}>
              {props.title}
            </Title>
          ) : (
            props.title
          )}
        </FlexItem>
        {props.children && (
          <FlexItem>
            <Flex
              alignItems={{ default: 'alignItemsCenter' }}
              gap={{ default: 'gapMd' }}
              flexWrap={{ default: 'wrap' }}
            >
              {props.children}
            </Flex>
          </FlexItem>
        )}
      </Flex>
    </CompassPanel>
  )
}
