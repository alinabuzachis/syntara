import {
  Card,
  CardBody,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  Flex,
  FlexItem,
  Label,
  StackItem,
  Title,
} from '@patternfly/react-core'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { authClient } from '../../client'
import { AppPanel } from '../../components/AppPanel'
import { useQueryState } from '../../components/states/useQueryState'

function getInitials(username: string): string {
  return username
    .split(/[._-\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

const avatarStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  backgroundColor: 'var(--pf-t--global--color--brand--default)',
  color: 'var(--pf-t--global--text--color--on-brand--default, #fff)',
  fontSize: '24px',
  fontWeight: 600,
}

export function MyProfile() {
  const query = authClient.useQuery('get', '/auth/me')
  const { data: profile } = query

  const queryState = useQueryState(query, {
    title: 'Error loading profile',
    onRetry: () => query.refetch(),
  })

  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="My Profile" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title="My Profile" />
      <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
        <AppPanel isFullHeight panelMainBodyProps={{ style: { padding: 'var(--pf-t--global--spacer--xl)' } }}>
          {profile ? (
            <div style={{ maxWidth: '700px' }}>
              <Card isFullHeight>
                <CardBody>
                  <Flex
                    alignItems={{ default: 'alignItemsCenter' }}
                    gap={{ default: 'gapLg' }}
                    style={{ marginBottom: 'var(--pf-t--global--spacer--lg)' }}
                  >
                    <FlexItem>
                      <span style={avatarStyle}>{getInitials(profile.username)}</span>
                    </FlexItem>
                    <FlexItem>
                      <Title headingLevel="h2">{profile.username}</Title>
                      <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>{profile.email}</span>
                    </FlexItem>
                  </Flex>

                  <Divider style={{ marginBottom: 'var(--pf-t--global--spacer--lg)' }} />

                  <Title headingLevel="h3" style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
                    Account details
                  </Title>

                  <DescriptionList isHorizontal termWidth="150px">
                    <DescriptionListGroup>
                      <DescriptionListTerm>User ID</DescriptionListTerm>
                      <DescriptionListDescription>
                        <code style={{ fontSize: 'var(--pf-t--global--font--size--sm)' }}>{profile.id}</code>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Username</DescriptionListTerm>
                      <DescriptionListDescription>{profile.username}</DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Email</DescriptionListTerm>
                      <DescriptionListDescription>{profile.email}</DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Groups</DescriptionListTerm>
                      <DescriptionListDescription>
                        {profile.groups && profile.groups.length > 0 ? (
                          <Flex gap={{ default: 'gapSm' }}>
                            {profile.groups.map((group) => (
                              <Label key={group}>{group}</Label>
                            ))}
                          </Flex>
                        ) : (
                          <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>No groups assigned</span>
                        )}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  </DescriptionList>
                </CardBody>
              </Card>
            </div>
          ) : null}
        </AppPanel>
      </StackItem>
    </AppPage>
  )
}
