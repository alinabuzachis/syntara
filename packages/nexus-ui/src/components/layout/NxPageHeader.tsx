import { CompassMainHeader, Flex, FlexItem, Stack, StackItem, Title, type TitleProps } from '@patternfly/react-core'
import type { ReactNode } from 'react'

import { NxPageBreadcrumbs, type AppBreadcrumbItem } from './NxPageBreadcrumbs'

export type { AppBreadcrumbItem }

function isRenderableSlot(value: ReactNode): boolean {
  return value != null && value !== false
}

export type NxPageHeaderProps = Readonly<{
  /** Primary page heading text (rendered as an `h1` unless `titleSlot` is set). */
  title: string
  breadcrumbs?: readonly AppBreadcrumbItem[]
  /**
   * Header toolbar actions (right-aligned in the compass header). Do not add a leading spacer; the layout supplies one.
   *
   * **Button order:** The primary action must always be the **last** (rightmost) element.
   * Place secondary buttons and other controls (switches, kebab menus) to its left.
   * This is the opposite of modals and full-page forms, where the primary button is leftmost.
   *
   * @example
   * // Correct: secondary left, primary rightmost
   * toolbar={<><Button variant="secondary">Cancel</Button><Button variant="primary">Save</Button></>}
   */
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

function renderTitleRegion(props: NxPageHeaderProps): ReactNode {
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

export function NxPageHeader(props: NxPageHeaderProps) {
  const titleRegion = renderTitleRegion(props)

  const crumbs = props.breadcrumbs
  const showCrumbs = crumbs !== undefined && crumbs.length >= 2
  const titleForCompass = showCrumbs ? (
    <Stack hasGutter>
      <StackItem>
        <NxPageBreadcrumbs items={crumbs} />
      </StackItem>
      <StackItem>{titleRegion}</StackItem>
    </Stack>
  ) : (
    titleRegion
  )

  return (
    <CompassMainHeader
      panelProps={{ isGlass: true }}
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
