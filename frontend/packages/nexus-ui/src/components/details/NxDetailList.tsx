import { DescriptionList } from '@patternfly/react-core'

/**
 * Wraps `NxDetail` rows inside workflow canvas nodes (task, condition, approval, converge).
 * Renders a compact description list that fits within the constrained space of a node card.
 */
export function NxDetailList(props: { children: React.ReactNode; isHorizontal?: boolean; 'data-testid'?: string }) {
  return (
    <DescriptionList
      data-testid={props['data-testid'] ?? 'description-list'}
      className="details"
      isCompact
      isHorizontal={props.isHorizontal}
    >
      {props.children}
    </DescriptionList>
  )
}
