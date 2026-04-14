import { zodResolver } from '@hookform/resolvers/zod'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  CompassPanel,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
  Title,
} from '@patternfly/react-core'
import { PlusIcon } from '@patternfly/react-icons'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'
import { z } from 'zod'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { useAlerts } from '../../../components/alerts'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { ErrorState } from '../../../components/states/ErrorState'
import { LoadingState } from '../../../components/states/LoadingState'
import { useQueryState } from '../../../components/states/useQueryState'
import { useDetailTab } from '../../../hooks/useDetailTab'
import { getErrorMessage } from '../../../utils/apiErrors'
import { formatDateTime } from '../../../utils/dateUtils'
import { accessClient } from '../../access/accessClient'
import { TypeaheadSelect } from '../../access/TypeaheadSelect'
import type { ProjectRead } from '../../access/types'
import { useAllUsers } from '../../access/useAllUsers'

import { ProjectNotFoundState } from './ProjectNotFoundState'

function ProjectDetailsTab({ project }: Readonly<{ project: ProjectRead }>) {
  const labelEntries = Object.entries(project.labels ?? {})

  return (
    <DescriptionList isHorizontal isAutoColumnWidths>
      <DescriptionListGroup>
        <DescriptionListTerm>Name</DescriptionListTerm>
        <DescriptionListDescription>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
            <FlexItem>{project.name}</FlexItem>
            {project.is_default && (
              <Label color="blue" isCompact>
                Default
              </Label>
            )}
          </Flex>
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Description</DescriptionListTerm>
        <DescriptionListDescription>{project.description ?? '-'}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Labels</DescriptionListTerm>
        <DescriptionListDescription>
          {labelEntries.length > 0 ? (
            <LabelGroup>
              {labelEntries.map(([key, value]) => (
                <Label key={key} isCompact>
                  {key}: {String(value)}
                </Label>
              ))}
            </LabelGroup>
          ) : (
            '-'
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Created</DescriptionListTerm>
        <DescriptionListDescription>{formatDateTime(project.created_at)}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Updated</DescriptionListTerm>
        <DescriptionListDescription>{formatDateTime(project.updated_at)}</DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  )
}

const assignProjectRoleSchema = z.object({
  userId: z.string().min(1, 'User is required'),
  roleName: z.string().min(1, 'Role is required'),
})

type AssignProjectRoleFormData = z.infer<typeof assignProjectRoleSchema>

interface AssignProjectRoleModalProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** Role names already assigned, keyed by user_id → Set<role_name> */
  assignedRolesByUser: Map<string, Set<string>>
}

function AssignProjectRoleModal({
  projectId,
  isOpen,
  onClose,
  onSuccess,
  assignedRolesByUser,
}: Readonly<AssignProjectRoleModalProps>) {
  const { showSuccess, showError } = useAlerts()

  const { control, handleSubmit, reset, watch, formState } = useForm<AssignProjectRoleFormData>({
    resolver: zodResolver(assignProjectRoleSchema, undefined, { mode: 'sync' }),
    defaultValues: { userId: '', roleName: '' },
  })

  useEffect(() => {
    if (isOpen) {
      reset({ userId: '', roleName: '' })
    }
  }, [isOpen, reset])

  const { users, isLoading: usersLoading } = useAllUsers()
  const rolesQuery = accessClient.useQuery('get', '/roles', { params: { query: { limit: 100 } } })

  const selectedUserId = watch('userId')

  const userOptions = useMemo(() => users.map((u) => ({ value: u.id, label: u.username ?? u.id })), [users])

  const roleOptions = useMemo(() => {
    const allRoles = rolesQuery.data?.resources ?? []
    const projectRoles = allRoles.filter((r) => r.project_id === null && r.name.startsWith('project-'))
    const assignedForUser = selectedUserId ? assignedRolesByUser.get(selectedUserId) : undefined
    return projectRoles
      .filter((r) => !assignedForUser?.has(r.name))
      .map((r) => ({
        value: r.name,
        label: r.name,
        description: r.description ?? undefined,
      }))
  }, [rolesQuery.data, selectedUserId, assignedRolesByUser])

  const { mutate: assignRole, isPending } = accessClient.useMutation('post', '/projects/{project_id}/roles')

  const handleClose = () => {
    reset({ userId: '', roleName: '' })
    onClose()
  }

  const onSubmit = handleSubmit((data) => {
    assignRole(
      {
        params: { path: { project_id: projectId } },
        body: { user_id: data.userId, role_name: data.roleName },
      },
      {
        onSuccess: () => {
          showSuccess('Role assigned', `Role "${data.roleName}" has been assigned.`)
          handleClose()
          onSuccess()
        },
        onError: (err: unknown) => {
          showError('Failed to assign role', getErrorMessage(err))
        },
      }
    )
  })

  const rolesLoading = rolesQuery.isPending

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="small">
      <ModalHeader title="Assign role" />
      <ModalBody>
        <Form id="assign-project-role-form" onSubmit={onSubmit}>
          <FormGroup label="User" fieldId="user-select" isRequired>
            <Controller
              name="userId"
              control={control}
              render={({ field, fieldState }) => (
                <>
                  <TypeaheadSelect
                    id="user-select"
                    ariaLabel="User"
                    options={userOptions}
                    selected={field.value}
                    onChange={field.onChange}
                    placeholder={usersLoading ? 'Loading users...' : 'Select a user...'}
                    hasError={!!fieldState.error}
                    isDisabled={usersLoading}
                  />
                  {fieldState.error && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem variant="error">{fieldState.error.message}</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </>
              )}
            />
          </FormGroup>
          <FormGroup label="Role" fieldId="role-select" isRequired>
            <Controller
              name="roleName"
              control={control}
              render={({ field, fieldState }) => (
                <>
                  <TypeaheadSelect
                    id="role-select"
                    ariaLabel="Role"
                    options={roleOptions}
                    selected={field.value}
                    onChange={field.onChange}
                    placeholder={rolesLoading ? 'Loading roles...' : 'Select a role...'}
                    hasError={!!fieldState.error}
                    isDisabled={rolesLoading || !selectedUserId}
                  />
                  {fieldState.error && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem variant="error">{fieldState.error.message}</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </>
              )}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="assign-project-role-form"
          isDisabled={!formState.isValid || isPending}
          isLoading={isPending}
        >
          Assign
        </Button>
        <Button variant="link" onClick={handleClose} isDisabled={isPending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function ProjectPermissionsTab({ projectId }: Readonly<{ projectId: string }>) {
  const [assignModalOpen, setAssignModalOpen] = useState(false)

  const rolesQuery = accessClient.useQuery('get', '/projects/{project_id}/roles', {
    params: { path: { project_id: projectId } },
  })

  const assignments = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data])

  const assignedRolesByUser = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const a of assignments) {
      const existing = map.get(a.user_id)
      if (existing) {
        existing.add(a.role_name)
      } else {
        map.set(a.user_id, new Set([a.role_name]))
      }
    }
    return map
  }, [assignments])

  const handleAssignSuccess = () => {
    rolesQuery.refetch().catch(() => {})
  }

  if (rolesQuery.isError) {
    return (
      <ErrorState
        title="Error loading permissions"
        message={rolesQuery.error}
        onRetry={() => rolesQuery.refetch().catch(() => {})}
      />
    )
  }

  if (rolesQuery.isPending) return <LoadingState />

  if (assignments.length === 0) {
    return (
      <>
        <EmptyStateNoData
          title="No permissions"
          description="No users have roles assigned in this project."
          buttonText="Assign role"
          addData={() => setAssignModalOpen(true)}
        />
        <AssignProjectRoleModal
          projectId={projectId}
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={handleAssignSuccess}
          assignedRolesByUser={assignedRolesByUser}
        />
      </>
    )
  }

  return (
    <>
      <Flex
        alignItems={{ default: 'alignItemsCenter' }}
        justifyContent={{ default: 'justifyContentFlexEnd' }}
        style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
      >
        <FlexItem>
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setAssignModalOpen(true)}>
            Assign role
          </Button>
        </FlexItem>
      </Flex>
      <Table aria-label="Project permissions" isStriped>
        <Thead>
          <Tr>
            <Th>Username</Th>
            <Th>Role</Th>
            <Th>Assigned</Th>
          </Tr>
        </Thead>
        <Tbody>
          {assignments.map((a) => (
            <Tr key={a.id}>
              <Td dataLabel="Username">{a.username ?? a.user_id}</Td>
              <Td dataLabel="Role">
                <Label isCompact color="green">
                  {a.role_name}
                </Label>
              </Td>
              <Td dataLabel="Assigned">{formatDateTime(a.created_at)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <AssignProjectRoleModal
        projectId={projectId}
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        onSuccess={handleAssignSuccess}
        assignedRolesByUser={assignedRolesByUser}
      />
    </>
  )
}

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const basePath = AppRoute.AccessManagement.ProjectDetail.replace(':projectId', projectId ?? '')
  type ProjectTab = 'details' | 'permissions'
  const [activeTab, goToTab] = useDetailTab<ProjectTab>(basePath)

  const projectQuery = accessClient.useQuery(
    'get',
    '/projects/{project_id}',
    { params: { path: { project_id: projectId ?? '' } } },
    { enabled: !!projectId, retry: false }
  )

  const navigateBack = () => navigate(AppRoute.AccessManagement.Projects)

  const projectData = projectQuery.data
  const refetchProject = projectQuery.refetch
  const queryState = useQueryState(projectQuery, {
    title: 'Error loading project',
    onRetry: () => {
      refetchProject().catch(() => {})
    },
  })

  if (projectQuery.error) {
    return (
      <AppPage>
        <AppPageHeader title="Project Details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <ProjectNotFoundState
              onBack={navigateBack}
              onRetry={() => {
                refetchProject().catch(() => {})
              }}
            />
          </CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Project Details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (!projectData) return null

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbItem component="button" onClick={() => navigate(AppRoute.AccessManagement.Projects)}>
        Access Management
      </BreadcrumbItem>
      <BreadcrumbItem component="button" onClick={() => navigate(AppRoute.AccessManagement.Projects)}>
        Projects
      </BreadcrumbItem>
      <BreadcrumbItem isActive>{projectData.name}</BreadcrumbItem>
    </Breadcrumb>
  )

  return (
    <AppPage>
      <AppPageHeader title={<Title headingLevel="h1">{projectData.name}</Title>} breadcrumb={breadcrumb} />
      <StackItem>
        <Tabs activeKey={activeTab} onSelect={(_event, key) => goToTab(key as ProjectTab)}>
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
          <Tab eventKey="permissions" title={<TabTitleText>Permissions</TabTitleText>} />
        </Tabs>
      </StackItem>
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight>
          {activeTab === 'details' && <ProjectDetailsTab project={projectData} />}
          {activeTab === 'permissions' && <ProjectPermissionsTab projectId={projectId ?? ''} />}
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
