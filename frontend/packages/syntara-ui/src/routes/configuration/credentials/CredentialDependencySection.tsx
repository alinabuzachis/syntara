import { Badge, Content, ContentVariants, List, ListItem } from '@patternfly/react-core'

/** Show individual names only when the type has this many items or fewer. */
export const NAMED_DEPENDENCY_LIMIT = 3

type NamedResource = {
  id?: string
  name: string
}

type CredentialDependencySectionProps = {
  label: string
  resources: NamedResource[]
}

/**
 * Ripple-effect dependency row: type label + badge count, with a name list only
 * when there are {@link NAMED_DEPENDENCY_LIMIT} or fewer items.
 */
export function CredentialDependencySection({ label, resources }: Readonly<CredentialDependencySectionProps>) {
  if (resources.length === 0) return null

  const showNames = resources.length <= NAMED_DEPENDENCY_LIMIT

  return (
    <>
      <Content component={ContentVariants.p}>
        {label} <Badge isRead>{resources.length}</Badge>
      </Content>
      {showNames && (
        <List>
          {resources.map((resource) => (
            <ListItem key={resource.id ?? resource.name}>{resource.name}</ListItem>
          ))}
        </List>
      )}
    </>
  )
}
