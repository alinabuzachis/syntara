import { DescriptionList } from '@patternfly/react-core'

export function Details(props: { children: React.ReactNode; isHorizontal?: boolean }) {
  return (
    <DescriptionList className="details" isCompact isHorizontal={props.isHorizontal}>
      {props.children}
    </DescriptionList>
  )
}
