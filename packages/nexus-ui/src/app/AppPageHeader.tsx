import { CompassMainHeader, Flex, Stack, StackItem, Title } from '@patternfly/react-core'

import { AppPageBreadcrumbs, type AppBreadcrumbItem } from './AppPageBreadcrumbs'

export type { AppBreadcrumbItem }

export type AppPageHeaderProps = Readonly<{
  title: React.ReactNode
  children?: React.ReactNode
  breadcrumbs?: readonly AppBreadcrumbItem[]
}>

export function AppPageHeader(props: AppPageHeaderProps) {
  const titleContent = typeof props.title === 'string' ? <Title headingLevel="h1">{props.title}</Title> : props.title

  const crumbs = props.breadcrumbs
  const showCrumbs = crumbs !== undefined && crumbs.length >= 2
  const titleSlot = showCrumbs ? (
    <Stack hasGutter>
      <StackItem>
        <AppPageBreadcrumbs items={crumbs} />
      </StackItem>
      <StackItem>{titleContent}</StackItem>
    </Stack>
  ) : (
    titleContent
  )

  return (
    <CompassMainHeader
      compassPanelProps={{ isGlass: true }}
      title={titleSlot}
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
