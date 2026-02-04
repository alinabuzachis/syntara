import { DescriptionList } from '@patternfly/react-core'

export function Details(props: { children: React.ReactNode }) {
  return (
    <DescriptionList className="details" isCompact>
      {props.children}
    </DescriptionList>
  )
}
