import {
  Alert,
  Button,
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  Label,
  Spinner,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { CheckCircleIcon, TimesCircleIcon } from '@patternfly/react-icons'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'

import { EmptyStateNoData } from '../../components/EmptyStateNoData'

import { accessFetchClient } from './accessClient'
import type { PermissionEntry } from './types'

export function MyPermissionsView() {
  const [permissions, setPermissions] = useState<PermissionEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [filter, setFilter] = useState('')

  const handleFetch = useCallback(async () => {
    setIsLoading(true)
    setPermissions(null)
    setError(null)

    try {
      const { data, error: fetchError } = await accessFetchClient.POST('/authz/what-can-i')
      if (fetchError) {
        throw new Error(JSON.stringify(fetchError))
      }
      setPermissions(data.permissions)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const filtered = useMemo(() => {
    if (!permissions) return []
    if (!filter.trim()) return permissions
    const term = filter.toLowerCase()
    return permissions.filter(
      (p) =>
        p.policy_name.toLowerCase().includes(term) ||
        p.effect.toLowerCase().includes(term) ||
        p.actions.some((a) => a.toLowerCase().includes(term)) ||
        p.scope.toLowerCase().includes(term) ||
        (p.project ?? '').toLowerCase().includes(term)
    )
  }, [permissions, filter])

  return (
    <Flex direction={{ default: 'row' }} gap={{ default: 'gapXl' }} alignItems={{ default: 'alignItemsFlexStart' }}>
      <FlexItem style={{ minWidth: 340, maxWidth: 400 }}>
        <Stack hasGutter>
          <StackItem>
            <Button variant="primary" onClick={handleFetch} isLoading={isLoading}>
              {permissions ? 'Refresh' : 'Load Permissions'}
            </Button>
          </StackItem>
          <StackItem>
            <Content component={ContentVariants.small}>Showing permissions for current user</Content>
          </StackItem>
        </Stack>
      </FlexItem>

      <FlexItem grow={{ default: 'grow' }}>
        <Stack hasGutter>
          {error && (
            <StackItem>
              <Alert variant="danger" title="Failed to load permissions" isInline>
                {error}
              </Alert>
            </StackItem>
          )}

          {!permissions && !error && !isLoading && (
            <StackItem>
              <EmptyStateNoData
                title="View all permissions"
                description="Click Load Permissions to see everything the current user is allowed to do."
              />
            </StackItem>
          )}

          {isLoading && (
            <StackItem>
              <Flex
                justifyContent={{ default: 'justifyContentCenter' }}
                style={{ padding: 'var(--pf-t--global--spacer--2xl)' }}
              >
                <Spinner size="lg" aria-label="Loading permissions" />
              </Flex>
            </StackItem>
          )}

          {permissions && (
            <>
              <StackItem>
                <TextInput
                  id="permissions-filter"
                  aria-label="Filter permissions"
                  value={filter}
                  onChange={(_e, val) => setFilter(val)}
                  placeholder="Filter by policy, action, scope, or project..."
                  style={{ maxWidth: 400 }}
                />
              </StackItem>
              <StackItem>
                <Table aria-label="User permissions" isPlain style={{ width: '100%' }}>
                  <Thead>
                    <Tr>
                      <Th>Policy</Th>
                      <Th>Effect</Th>
                      <Th>Actions</Th>
                      <Th>Scope</Th>
                      <Th>Project</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {filtered.map((perm) => (
                      <Tr
                        key={`${perm.policy_name}-${perm.effect}-${perm.actions.join(',')}-${perm.scope}-${perm.project}`}
                      >
                        <Td dataLabel="Policy">
                          <code>{perm.policy_name}</code>
                        </Td>
                        <Td dataLabel="Effect">
                          <Label
                            color={perm.effect === 'allow' ? 'green' : 'red'}
                            icon={perm.effect === 'allow' ? <CheckCircleIcon /> : <TimesCircleIcon />}
                            isCompact
                          >
                            {perm.effect}
                          </Label>
                        </Td>
                        <Td dataLabel="Actions">
                          <Flex gap={{ default: 'gapXs' }} flexWrap={{ default: 'wrap' }}>
                            {perm.actions.map((a) => (
                              <FlexItem key={a}>
                                <Label color="blue" isCompact>
                                  {a}
                                </Label>
                              </FlexItem>
                            ))}
                          </Flex>
                        </Td>
                        <Td dataLabel="Scope">{perm.scope || '-'}</Td>
                        <Td dataLabel="Project">{perm.project || '-'}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </StackItem>
              <StackItem>
                <Content component={ContentVariants.small}>
                  {filtered.length} of {permissions.length} permission{permissions.length === 1 ? '' : 's'}
                </Content>
              </StackItem>
            </>
          )}
        </Stack>
      </FlexItem>
    </Flex>
  )
}
