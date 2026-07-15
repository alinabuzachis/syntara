import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core'
import { RhUiAddIcon } from '@patternfly/react-icons'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useFormMutationErrorHandler } from '../../hooks/useFormMutationErrorHandler'
import { useAlerts } from '../../providers/alerts'

import { accessClient } from './accessClient'
import { assignRoleSchema } from './assignRoleSchema'
import type { AssignRoleFormData } from './assignRoleSchema'
import { TypeaheadSelect } from './TypeaheadSelect'
import { useAllProjects } from './useAllProjects'

const PAGE_SIZE = 20

// ── Form body (extracted to stay within max-lines-per-function) ───────────

type AssignRoleFormBodyProps = {
  control: ReturnType<typeof useForm<AssignRoleFormData>>['control']
  setValue: ReturnType<typeof useForm<AssignRoleFormData>>['setValue']
  principalOrGroup: string
  isProjectScoped: boolean
  projectOptions: { value: string; label: string }[]
  userOptions: { value: string; label: string }[]
  groupOptions: { value: string; label: string }[]
  roleOptions: { value: string; label: string }[]
  roleDisabled: boolean
  isProjectsLoading: boolean
  onUserSearchChange: (term: string) => void
  hasMoreUsers: boolean
  isUsersLoading: boolean
  onGroupSearchChange: (term: string) => void
  hasMoreGroups: boolean
  isGroupsLoading: boolean
  onRoleSearchChange: (term: string) => void
  hasMoreRoles: boolean
  isRolesLoading: boolean
}

function AssignRoleFormBody({
  control,
  setValue,
  principalOrGroup,
  isProjectScoped,
  projectOptions,
  userOptions,
  groupOptions,
  roleOptions,
  roleDisabled,
  isProjectsLoading,
  onUserSearchChange,
  hasMoreUsers,
  isUsersLoading,
  onGroupSearchChange,
  hasMoreGroups,
  isGroupsLoading,
  onRoleSearchChange,
  hasMoreRoles,
  isRolesLoading,
}: Readonly<AssignRoleFormBodyProps>) {
  return (
    <>
      <FormGroup label="Principal type" isRequired fieldId="principal-type">
        <Controller
          name="principalOrGroup"
          control={control}
          render={({ field }) => (
            <FormSelect
              id="principal-type"
              aria-label="Principal type"
              value={field.value}
              onChange={(_event, value) => {
                field.onChange(value)
                setValue('userId', '')
                setValue('groupId', '')
              }}
            >
              <FormSelectOption value="principal" label="User" />
              <FormSelectOption value="group" label="Group" />
            </FormSelect>
          )}
        />
      </FormGroup>

      <FormGroup label="Scope" isRequired fieldId="scope">
        <Controller
          name="scope"
          control={control}
          render={({ field }) => (
            <FormSelect
              id="scope"
              aria-label="Scope"
              value={field.value}
              onChange={(_event, value) => {
                field.onChange(value)
                setValue('roleName', '')
              }}
            >
              <FormSelectOption value="system" label="System" />
              <FormSelectOption value="project" label="Project" />
            </FormSelect>
          )}
        />
      </FormGroup>

      {isProjectScoped && (
        <FormGroup label="Project" isRequired fieldId="project-id">
          <Controller
            name="projectId"
            control={control}
            render={({ field, fieldState }) => (
              <>
                <TypeaheadSelect
                  id="project-id"
                  ariaLabel="Project"
                  options={projectOptions}
                  selected={field.value ?? ''}
                  onChange={(value) => {
                    field.onChange(value)
                    setValue('roleName', '')
                  }}
                  placeholder="Select a project..."
                  hasError={!!fieldState.error}
                  isLoading={isProjectsLoading}
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
      )}

      {principalOrGroup === 'principal' && (
        <FormGroup label="User" isRequired fieldId="user-id">
          <Controller
            name="userId"
            control={control}
            render={({ field, fieldState }) => (
              <>
                <TypeaheadSelect
                  id="user-id"
                  ariaLabel="User"
                  options={userOptions}
                  selected={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Select a user..."
                  hasError={!!fieldState.error}
                  onSearchChange={onUserSearchChange}
                  hasMore={hasMoreUsers}
                  isLoading={isUsersLoading}
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
      )}

      {principalOrGroup === 'group' && (
        <FormGroup label="Group" isRequired fieldId="group-id">
          <Controller
            name="groupId"
            control={control}
            render={({ field, fieldState }) => (
              <>
                <TypeaheadSelect
                  id="group-id"
                  ariaLabel="Group"
                  options={groupOptions}
                  selected={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Select a group..."
                  hasError={!!fieldState.error}
                  onSearchChange={onGroupSearchChange}
                  hasMore={hasMoreGroups}
                  isLoading={isGroupsLoading}
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
      )}

      <FormGroup label="Role" isRequired fieldId="role-select">
        <Controller
          name="roleName"
          control={control}
          render={({ field, fieldState }) => (
            <>
              <TypeaheadSelect
                id="role-select"
                ariaLabel="Role"
                options={roleOptions}
                selected={field.value ?? ''}
                onChange={field.onChange}
                placeholder={roleDisabled ? 'Select a project first...' : 'Select a role...'}
                hasError={!!fieldState.error}
                isDisabled={roleDisabled}
                onSearchChange={onRoleSearchChange}
                hasMore={hasMoreRoles}
                isLoading={isRolesLoading}
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
    </>
  )
}

// ── Dialog ─────────────────────────────────────────────────────────────────

type AssignRoleDialogProps = {
  onClose: () => void
  onSuccess: () => void
}

export function AssignRoleDialog({ onClose, onSuccess }: Readonly<AssignRoleDialogProps>) {
  const { showSuccess } = useAlerts()

  const { handleSubmit, control, setValue, setError } = useForm<AssignRoleFormData>({
    resolver: zodResolver(assignRoleSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      principalOrGroup: 'principal',
      scope: 'project',
      projectId: '',
      userId: '',
      groupId: '',
      roleName: '',
    },
  })

  const principalOrGroup = useWatch({ control, name: 'principalOrGroup' })
  const scope = useWatch({ control, name: 'scope' })
  const selectedProjectId = useWatch({ control, name: 'projectId' })
  const isProjectScoped = scope === 'project'

  const { projects: allProjects, isLoading: isProjectsLoading } = useAllProjects()
  const projectOptions = useMemo(
    () =>
      allProjects.filter((p): p is typeof p & { id: string } => !!p.id).map((p) => ({ value: p.id, label: p.name })),
    [allProjects]
  )

  const [userSearchTerm, setUserSearchTerm] = useState('')
  const debouncedUserSearch = useDebouncedValue(userSearchTerm)
  const usersQuery = accessClient.useQuery('get', '/users_directory', {
    params: {
      query: { limit: PAGE_SIZE, ...(debouncedUserSearch ? { 'username[contains]': debouncedUserSearch } : {}) },
    },
  })
  const userOptions = useMemo(
    () => (usersQuery.data?.resources ?? []).map((u) => ({ value: u.id, label: u.username })),
    [usersQuery.data]
  )

  const [groupSearchTerm, setGroupSearchTerm] = useState('')
  const debouncedGroupSearch = useDebouncedValue(groupSearchTerm)
  const groupsQuery = accessClient.useQuery('get', '/groups_directory', {
    params: {
      query: { limit: PAGE_SIZE, ...(debouncedGroupSearch ? { 'name[contains]': debouncedGroupSearch } : {}) },
    },
  })
  const groupOptions = useMemo(
    () => (groupsQuery.data?.resources ?? []).map((g) => ({ value: g.id, label: g.name })),
    [groupsQuery.data]
  )

  const [roleSearchTerm, setRoleSearchTerm] = useState('')
  const debouncedRoleSearch = useDebouncedValue(roleSearchTerm)
  const systemRolesQuery = accessClient.useQuery('get', '/roles', {
    params: {
      query: {
        limit: PAGE_SIZE,
        scope: 'system',
        ...(debouncedRoleSearch ? { 'name[contains]': debouncedRoleSearch } : {}),
      },
    },
  })
  const projectRolesQuery = accessClient.useQuery(
    'get',
    '/projects/{project_id}/roles',
    {
      params: {
        path: { project_id: selectedProjectId || '' },
        query: { limit: PAGE_SIZE, ...(debouncedRoleSearch ? { 'name[contains]': debouncedRoleSearch } : {}) },
      },
    },
    { enabled: isProjectScoped && !!selectedProjectId }
  )
  const activeRolesQuery = isProjectScoped ? projectRolesQuery : systemRolesQuery
  const roleOptions = useMemo(
    () => (activeRolesQuery.data?.resources ?? []).map((role) => ({ value: role.name, label: role.name })),
    [activeRolesQuery.data]
  )

  const { mutate: createRoleAssignment, isPending: isPendingSystem } = accessClient.useMutation(
    'post',
    '/role_assignments'
  )
  const { mutate: createProjectRoleAssignment, isPending: isPendingProject } = accessClient.useMutation(
    'post',
    '/projects/{project_id}/role_assignments'
  )
  const isPending = isPendingSystem || isPendingProject

  const handleError = useFormMutationErrorHandler<AssignRoleFormData>(setError)

  const onSubmit = (data: AssignRoleFormData) => {
    const onMutationSuccess = () => {
      showSuccess({ title: 'Assignment added', description: 'Assignment created successfully' })
      onSuccess()
      onClose()
    }
    const onMutationError = handleError({ title: 'Failed to add assignment' })
    const body =
      data.principalOrGroup === 'group'
        ? { group_id: data.groupId, role_name: data.roleName }
        : { principal_id: data.userId, role_name: data.roleName }

    if (data.scope === 'project') {
      createProjectRoleAssignment(
        { params: { path: { project_id: data.projectId } }, body },
        { onSuccess: onMutationSuccess, onError: onMutationError }
      )
    } else {
      createRoleAssignment({ body }, { onSuccess: onMutationSuccess, onError: onMutationError })
    }
  }

  return (
    <Modal isOpen onClose={onClose} variant="small">
      <ModalHeader title="Add Assignment" />
      <ModalBody>
        <Form id="assign-role-form" onSubmit={handleSubmit(onSubmit)}>
          <AssignRoleFormBody
            control={control}
            setValue={setValue}
            principalOrGroup={principalOrGroup}
            isProjectScoped={isProjectScoped}
            projectOptions={projectOptions}
            userOptions={userOptions}
            groupOptions={groupOptions}
            roleOptions={roleOptions}
            roleDisabled={isProjectScoped && !selectedProjectId}
            isProjectsLoading={isProjectsLoading}
            onUserSearchChange={setUserSearchTerm}
            hasMoreUsers={!!usersQuery.data?.next}
            isUsersLoading={usersQuery.isFetching}
            onGroupSearchChange={setGroupSearchTerm}
            hasMoreGroups={!!groupsQuery.data?.next}
            isGroupsLoading={groupsQuery.isFetching}
            onRoleSearchChange={setRoleSearchTerm}
            hasMoreRoles={!!activeRolesQuery.data?.next}
            isRolesLoading={activeRolesQuery.isFetching}
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" form="assign-role-form" type="submit" isLoading={isPending} icon={<RhUiAddIcon />}>
          Add assignment
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
