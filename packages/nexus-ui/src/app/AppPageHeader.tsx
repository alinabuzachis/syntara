import { CompassMainHeader, Flex, FlexItem, Stack, StackItem, Title, type TitleProps } from '@patternfly/react-core'
import type { ReactNode } from 'react'

import { AppPageBreadcrumbs, type AppBreadcrumbItem } from './AppPageBreadcrumbs'

export type { AppBreadcrumbItem }

function isRenderableSlot(value: ReactNode): boolean {
  return value != null && value !== false
}

export type AppPageHeaderProps = Readonly<{
  /** Primary page heading text (rendered as an `h1` unless `titleSlot` is set). */
  title: string
  breadcrumbs?: readonly AppBreadcrumbItem[]
  /** Header toolbar actions (right-aligned in the compass header). Do not add a leading spacer; the layout supplies one. */
  toolbar?: ReactNode
  /** Optional content before the default title (e.g. provider icon). Ignored when `titleSlot` is set. */
  titleLeading?: ReactNode
  /** Optional content after the default title (badges, status, metadata). Ignored when `titleSlot` is set. */
  titleAddons?: ReactNode
  /** Optional project selector after the title row. Ignored when `titleSlot` is set. */
  projectSelector?: ReactNode
  /**
   * Replaces the composed title row (including the default `Title`). Use when the header cannot be
   * expressed as plain text plus optional leading/addons (e.g. editable workflow name in the builder).
   */
  titleSlot?: ReactNode
  /** Extra props for the default PatternFly `Title` (`headingLevel` is always `h1`). */
  titleProps?: Readonly<Pick<TitleProps, 'size' | 'className'>>
}>

function renderTitleRegion(props: AppPageHeaderProps): ReactNode {
  if (isRenderableSlot(props.titleSlot)) {
    return props.titleSlot
  }

  const { title, titleLeading, titleAddons, projectSelector, titleProps } = props

  const useCompositeRow =
    isRenderableSlot(titleLeading) || isRenderableSlot(titleAddons) || isRenderableSlot(projectSelector)

  if (!useCompositeRow) {
    return (
      <Title headingLevel="h1" {...titleProps}>
        {title}
      </Title>
    )
  }

  return (
    <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }} flexWrap={{ default: 'wrap' }}>
      {isRenderableSlot(titleLeading) && (
        <FlexItem style={{ display: 'flex', alignItems: 'center' }}>{titleLeading}</FlexItem>
      )}
      <FlexItem>
        <Title headingLevel="h1" {...titleProps}>
          {title}
        </Title>
      </FlexItem>
      {isRenderableSlot(titleAddons) ? titleAddons : null}
      {isRenderableSlot(projectSelector) && <FlexItem>{projectSelector}</FlexItem>}
    </Flex>
  )
}

export function AppPageHeader(props: AppPageHeaderProps) {
  const titleRegion = renderTitleRegion(props)

  const crumbs = props.breadcrumbs
  const showCrumbs = crumbs !== undefined && crumbs.length >= 2
  const titleForCompass = showCrumbs ? (
    <Stack hasGutter>
      <StackItem>
        <AppPageBreadcrumbs items={crumbs} />
      </StackItem>
      <StackItem>{titleRegion}</StackItem>
    </Stack>
  ) : (
    titleRegion
  )

  return (
    <CompassMainHeader
      compassPanelProps={{ isGlass: true }}
      title={titleForCompass}
      toolbar={
        isRenderableSlot(props.toolbar) ? (
          <Flex
            alignItems={{ default: 'alignItemsCenter' }}
            gap={{ default: 'gapMd' }}
            flexWrap={{ default: 'nowrap' }}
          >
            <FlexItem grow={{ default: 'grow' }} />
            {props.toolbar}
          </Flex>
        ) : undefined
      }
    />
  )
}
