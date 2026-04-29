import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Spinner,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { RhUiCaretLeftIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { ErrorState } from '../../components/states/ErrorState'
import { getErrorMessage } from '../../utils/apiErrors'

import { accessClient } from './accessClient'
import type { ResourceActionMap } from './canIUtils'
import { ResourceIdSelect } from './ResourceIdSelect'
import { TypeaheadSelect } from './TypeaheadSelect'
import type { WhoCanUser } from './types'

const whoCanSchema = z.object({
  resourceType: z.string().min(1, 'Resource type is required'),
  action: z.string().min(1, 'Action is required'),
  resourceId: z.string().optional(),
  project: z.string().optional(),
})

type WhoCanFormData = z.infer<typeof whoCanSchema>

function WhoCanResults({
  users,
  action,
  resourceType,
  project,
  nextCursor,
  hasPrevPage,
  isPending,
  onNextPage,
  onPrevPage,
}: Readonly<{
  users: WhoCanUser[]
  action: string
  resourceType: string
  project: string
  nextCursor: string | null
  hasPrevPage: boolean
  isPending: boolean
  onNextPage: () => void
  onPrevPage: () => void
}>) {
  const projectSuffix = project ? ` in "${project}" project` : ''

  return (
    <>
      <StackItem>
        <Alert
          variant={users.length > 0 ? 'info' : 'warning'}
          title={
            users.length > 0
              ? `Users who can perform action "${action}" on resource "${resourceType}"${projectSuffix}`
              : `No users can perform action "${action}" on resource "${resourceType}"${projectSuffix}`
          }
          isInline
          isPlain
        />
      </StackItem>
      {users.length > 0 && (
        <>
          <StackItem>
            <Table aria-label="Users with access" isStriped style={{ width: '100%' }}>
              <Thead>
                <Tr>
                  <Th>Username</Th>
                </Tr>
              </Thead>
              <Tbody>
                {users.map((u) => (
                  <Tr key={u.id}>
                    <Td dataLabel="Username">{u.username}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </StackItem>
          <StackItem>
            <Flex
              justifyContent={{ default: 'justifyContentSpaceBetween' }}
              alignItems={{ default: 'alignItemsCenter' }}
              style={{ padding: 'var(--pf-t--global--spacer--md) 0' }}
            >
              <FlexItem>
                <Content component={ContentVariants.p}>
                  {users.length} {users.length === 1 ? 'user' : 'users'}
                </Content>
              </FlexItem>
              {(hasPrevPage || nextCursor) && (
                <Flex gap={{ default: 'gapSm' }}>
                  <Button
                    variant="plain"
                    isDisabled={!hasPrevPage || isPending}
                    onClick={onPrevPage}
                    aria-label="Previous page"
                  >
                    <RhUiCaretLeftIcon /> Previous
                  </Button>
                  <Button
                    variant="plain"
                    isDisabled={!nextCursor || isPending}
                    onClick={onNextPage}
                    aria-label="Next page"
                  >
                    Next <RhUiCaretRightIcon />
                  </Button>
                </Flex>
              )}
            </Flex>
          </StackItem>
        </>
      )}
    </>
  )
}

export function WhoCanView({ resourceTypes, actionsByResource }: Readonly<ResourceActionMap>) {
  const projectsQuery = accessClient.useQuery('get', '/projects', {
    params: { query: { limit: 100 } },
  })
  const projects = projectsQuery.data?.resources ?? []

  const { control, handleSubmit, watch, setValue, getValues } = useForm<WhoCanFormData>({
    resolver: zodResolver(whoCanSchema, undefined, { mode: 'sync' }),
    defaultValues: { resourceType: '', action: '', resourceId: '', project: '' },
  })

  const resourceType = watch('resourceType')
  const action = watch('action')
  const project = watch('project')

  const availableActions = useMemo(
    () => (resourceType ? (actionsByResource.get(resourceType) ?? []) : []),
    [resourceType, actionsByResource]
  )

  // Cascade: when resourceType changes, reset dependent fields
  useEffect(() => {
    const actions = actionsByResource.get(resourceType) ?? []
    const currentAction = getValues('action')
    if (actions.length === 1) {
      setValue('action', actions[0])
    } else if (!actions.includes(currentAction)) {
      setValue('action', '')
    }
    setValue('resourceId', '')
  }, [resourceType, actionsByResource, setValue, getValues])

  // Pagination state: track cursor history for previous page navigation
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined)
  const lastFormData = useRef<WhoCanFormData | null>(null)

  const whoCanMutation = accessClient.useMutation('post', '/authz/who-can')

  const submitWithCursor = useCallback(
    (formData: WhoCanFormData, cursor?: string) => {
      lastFormData.current = formData
      whoCanMutation.mutate({
        body: {
          action: formData.action.trim(),
          resource_type: formData.resourceType.trim(),
          ...(formData.resourceId?.trim() && { resource_id: formData.resourceId.trim() }),
          ...(formData.project?.trim() && { resource_project: formData.project.trim() }),
          ...(cursor && { cursor }),
        },
      })
    },
    [whoCanMutation]
  )

  const onSubmit = handleSubmit((formData) => {
    setCursorHistory([])
    setCurrentCursor(undefined)
    submitWithCursor(formData)
  })

  const nextCursor = whoCanMutation.data?.next_cursor ?? null
  const result: WhoCanUser[] | null = whoCanMutation.data?.users ?? null

  const handleNextPage = useCallback(() => {
    if (!nextCursor || !lastFormData.current) return
    setCursorHistory((prev) => [...prev, currentCursor ?? ''])
    setCurrentCursor(nextCursor)
    submitWithCursor(lastFormData.current, nextCursor)
  }, [nextCursor, currentCursor, submitWithCursor])

  const handlePrevPage = useCallback(() => {
    if (cursorHistory.length === 0 || !lastFormData.current) return
    const prev = [...cursorHistory]
    const prevCursor = prev.pop()
    setCursorHistory(prev)
    setCurrentCursor(prevCursor === '' ? undefined : prevCursor)
    submitWithCursor(lastFormData.current, prevCursor === '' ? undefined : prevCursor)
  }, [cursorHistory, submitWithCursor])

  return (
    <Flex direction={{ default: 'row' }} gap={{ default: 'gapXl' }} alignItems={{ default: 'alignItemsFlexStart' }}>
      <FlexItem style={{ minWidth: 340, maxWidth: 400 }}>
        <Form onSubmit={onSubmit}>
          <FormGroup label="Resource type" isRequired fieldId="who-can-resource-type">
            <Controller
              name="resourceType"
              control={control}
              render={({ field }) => (
                <TypeaheadSelect
                  id="who-can-resource-type"
                  ariaLabel="Resource type"
                  options={resourceTypes.map((rt) => ({ value: rt, label: rt }))}
                  selected={field.value}
                  onChange={field.onChange}
                  placeholder="Select a resource type"
                />
              )}
            />
          </FormGroup>

          <FormGroup label="Action" isRequired fieldId="who-can-action">
            <Controller
              name="action"
              control={control}
              render={({ field }) => (
                <TypeaheadSelect
                  id="who-can-action"
                  ariaLabel="Action"
                  options={availableActions.map((a) => ({ value: a, label: a }))}
                  selected={field.value}
                  onChange={field.onChange}
                  placeholder={resourceType ? 'Select an action' : 'Select a resource type first'}
                  isDisabled={!resourceType}
                />
              )}
            />
          </FormGroup>

          <FormGroup label="Project" fieldId="who-can-project">
            <Controller
              name="project"
              control={control}
              render={({ field }) => (
                <FormSelect
                  id="who-can-project"
                  aria-label="Project"
                  value={field.value ?? ''}
                  onChange={(_e, val) => field.onChange(val)}
                >
                  <FormSelectOption value="" label="Any project" isPlaceholder />
                  {projects.map((p) => (
                    <FormSelectOption key={p.id} value={p.name} label={p.name} />
                  ))}
                </FormSelect>
              )}
            />
          </FormGroup>

          <FormGroup label="Resource ID" fieldId="who-can-resource-id">
            <Controller
              name="resourceId"
              control={control}
              render={({ field }) => (
                <ResourceIdSelect resourceType={resourceType} value={field.value ?? ''} onChange={field.onChange} />
              )}
            />
          </FormGroup>

          <Button
            variant="primary"
            type="submit"
            isDisabled={!resourceType.trim() || !action.trim()}
            isLoading={whoCanMutation.isPending}
          >
            Find Users
          </Button>
        </Form>
      </FlexItem>

      <FlexItem grow={{ default: 'grow' }}>
        <Stack hasGutter>
          {whoCanMutation.isIdle && (
            <StackItem>
              <EmptyStateNoData
                title="Find who has access"
                description="Enter an action and resource type to see which users can perform it."
              />
            </StackItem>
          )}

          {whoCanMutation.isPending && (
            <StackItem>
              <Flex
                justifyContent={{ default: 'justifyContentCenter' }}
                style={{ padding: 'var(--pf-t--global--spacer--2xl)' }}
              >
                <Spinner size="lg" aria-label="Finding users" />
              </Flex>
            </StackItem>
          )}

          {whoCanMutation.isError && (
            <StackItem>
              <ErrorState title="Query failed" message={getErrorMessage(whoCanMutation.error)} onRetry={onSubmit} />
            </StackItem>
          )}

          {result && (
            <WhoCanResults
              users={result}
              action={action}
              resourceType={resourceType}
              project={project ?? ''}
              nextCursor={nextCursor}
              hasPrevPage={cursorHistory.length > 0}
              isPending={whoCanMutation.isPending}
              onNextPage={handleNextPage}
              onPrevPage={handlePrevPage}
            />
          )}
        </Stack>
      </FlexItem>
    </Flex>
  )
}
