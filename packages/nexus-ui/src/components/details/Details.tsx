import { DescriptionList } from '@patternfly/react-core'

export function Details(props: { children: React.ReactNode; isHorizontal?: boolean; 'data-testid'?: string }) {
  return (
    <DescriptionList data-testid={props['data-testid'] ?? 'description-list'} className="details" isCompact isHorizontal={props.isHorizontal}>
      {props.children}
    </DescriptionList>
  )
}
