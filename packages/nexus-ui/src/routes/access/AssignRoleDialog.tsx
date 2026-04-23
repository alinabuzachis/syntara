import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core'
import { useEffect, useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { useAlerts } from '../../components/alerts'
import { getErrorMessage } from '../../utils/apiErrors'

import { accessClient } from './accessClient'
import { assignRoleSchema } from './assignRoleSchema'
import type { AssignRoleFormData } from './assignRoleSchema'
import { TypeaheadSelect } from './TypeaheadSelect'
import { useAllRoles } from './useAllRoles'
import { useAllUsers } from './useAllUsers'

const ASSIGNMENT_TYPE_OPTIONS = [
  { value: 'user-project', label: 'User to Project' },
  { value: 'group-project', label: 'Group to Project' },
  { value: 'user-system', label: 'User to System Role' },
  { value: 'group-system', label: 'Group to System Role' },
]

// ── Form fields ───────────────────────────────────────────────────────────

type AssignmentFormFieldsProps = {
  assignmentType: string
  projectOptions: { value: string; label: string }[]
  userOptions: { value: string; label: string }[]
  roleOptions: { value: string; label: string }[]
  isRoleDisabled: boolean
  errors: ReturnType<typeof useForm<AssignRoleFormData>>['formState']['errors']
  control: ReturnType<typeof useForm<AssignRoleFormData>>['control']
  register: ReturnType<typeof useForm<AssignRoleFormData>>['register']
}

function AssignmentFormFields({
  assignmentType,
  projectOptions,
  userOptions,
  roleOptions,
  isRoleDisabled,
  errors,
  control,
  register,
}: Readonly<AssignmentFormFieldsProps>) {
  const isProjectScoped = assignmentType === 'user-project' || assignmentType === 'group-project'

  return (
    <>
      {isProjectScoped && (
        <FormGroup label="Project" isRequired fieldId="project-id">
          <Controller
            name="projectId"
            control={control}
            render={({ field }) => (
              <TypeaheadSelect
                id="project-id"
                ariaLabel="Project"
                options={projectOptions}
                selected={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Select a project..."
                hasError={!!errors.projectId}
              />
            )}
          />
        </FormGroup>
      )}

      {(assignmentType === 'user-project' || assignmentType === 'user-system') && (
        <FormGroup label="User" isRequired fieldId="user-id">
          <Controller
            name="userId"
            control={control}
            render={({ field }) => (
              <TypeaheadSelect
                id="user-id"
                ariaLabel="User"
                options={userOptions}
                selected={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Select a user..."
                hasError={!!errors.userId}
              />
            )}
          />
        </FormGroup>
      )}

      {(assignmentType === 'group-project' || assignmentType === 'group-system') && (
        <FormGroup label="Group ID" isRequired fieldId="group-id">
          <TextInput
            id="group-id"
            isRequired
            aria-label="Group ID"
            validated={errors.groupId ? 'error' : 'default'}
            {...register('groupId')}
          />
        </FormGroup>
      )}

      <FormGroup label="Role" isRequired fieldId="role-select">
        <Controller
          key={isProjectScoped ? 'roleName' : 'systemRoleName'}
          name={isProjectScoped ? 'roleName' : 'systemRoleName'}
          control={control}
          render={({ field }) => (
            <TypeaheadSelect
              id="role-select"
              ariaLabel="Role"
              options={roleOptions}
              selected={field.value ?? ''}
              onChange={field.onChange}
              placeholder={isRoleDisabled ? 'Select a project first...' : 'Select a role...'}
              hasError={isProjectScoped ? !!errors.roleName : !!errors.systemRoleName}
              isDisabled={isRoleDisabled}
            />
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
  const { showSuccess, showError } = useAlerts()

  const projectsQuery = accessClient.useQuery('get', '/projects')
  const projectsData = projectsQuery.data

  const { users } = useAllUsers()
  const { roles: allRoles } = useAllRoles()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<AssignRoleFormData>({
    resolver: zodResolver(assignRoleSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      assignmentType: 'user-project',
      projectId: '',
      userId: '',
      groupId: '',
      roleName: '',
      systemRoleName: '',
    },
  })

  const assignmentType = useWatch({ control, name: 'assignmentType' })
  const selectedProjectId = useWatch({ control, name: 'projectId' })
  const isProjectScoped = assignmentType === 'user-project' || assignmentType === 'group-project'

  // Reset role selection when switching between project/system scope
  // because project-scoped uses roleName and system-scoped uses systemRoleName
  useEffect(() => {
    setValue('roleName', '')
    setValue('systemRoleName', '')
  }, [assignmentType, setValue])

  // Reset role selection when project changes (roles are project-specific)
  useEffect(() => {
    if (isProjectScoped) {
      setValue('roleName', '')
    }
  }, [selectedProjectId, isProjectScoped, setValue])

  const projectOptions = useMemo(
    () =>
      (projectsData ?? [])
        .filter((p): p is typeof p & { id: string } => !!p.id)
        .map((p) => ({ value: p.id, label: p.name })),
    [projectsData]
  )

  const userOptions = useMemo(() => users.map((u) => ({ value: u.id, label: u.username })), [users])

  const roleOptions = useMemo(() => {
    const filtered =
      isProjectScoped && selectedProjectId ? allRoles.filter((role) => role.project_id === selectedProjectId) : allRoles
    return filtered.map((role) => ({
      value: role.name,
      label: role.name,
      tag: !role.project_id
        ? { label: 'System', color: 'blue' as const }
        : { label: 'Project', color: 'green' as const },
    }))
  }, [allRoles, isProjectScoped, selectedProjectId])

  const { mutate: assignProjectRole, isPending: isPendingProjectRole } = accessClient.useMutation(
    'post',
    '/projects/{project_id}/role-assignments'
  )
  const { mutate: assignProjectGroupRole, isPending: isPendingProjectGroupRole } = accessClient.useMutation(
    'post',
    '/projects/{project_id}/group-role-assignments'
  )
  const { mutate: assignSystemUserRole, isPending: isPendingSystemUserRole } = accessClient.useMutation(
    'post',
    '/user-role-assignments'
  )
  const { mutate: assignSystemGroupRole, isPending: isPendingSystemGroupRole } = accessClient.useMutation(
    'post',
    '/group-role-assignments'
  )

  const isPending =
    isPendingProjectRole || isPendingProjectGroupRole || isPendingSystemUserRole || isPendingSystemGroupRole

  const onSubmit = (data: AssignRoleFormData) => {
    const handleSuccess = () => {
      showSuccess('Assignment added', 'Assignment created successfully')
      onSuccess()
      onClose()
    }
    const handleError = (error: unknown) => {
      showError('Failed to add assignment', getErrorMessage(error))
    }

    switch (data.assignmentType) {
      case 'user-project':
        assignProjectRole(
          {
            params: { path: { project_id: data.projectId } },
            body: { user_id: data.userId, role_name: data.roleName },
          },
          { onSuccess: handleSuccess, onError: handleError }
        )
        break
      case 'group-project':
        assignProjectGroupRole(
          {
            params: { path: { project_id: data.projectId } },
            body: { group_id: data.groupId, role_name: data.roleName },
          },
          { onSuccess: handleSuccess, onError: handleError }
        )
        break
      case 'user-system':
        assignSystemUserRole(
          { body: { user_id: data.userId, role_name: data.systemRoleName } },
          { onSuccess: handleSuccess, onError: handleError }
        )
        break
      case 'group-system':
        assignSystemGroupRole(
          { body: { group_id: data.groupId, role_name: data.systemRoleName } },
          { onSuccess: handleSuccess, onError: handleError }
        )
        break
    }
  }

  return (
    <Modal isOpen onClose={onClose} variant="small">
      <ModalHeader title="Add Assignment" />
      <ModalBody>
        <Form id="assign-role-form" onSubmit={handleSubmit(onSubmit)}>
          <FormGroup label="Assignment type" isRequired fieldId="assignment-type">
            <Controller
              name="assignmentType"
              control={control}
              render={({ field }) => (
                <FormSelect
                  id="assignment-type"
                  aria-label="Assignment type"
                  validated={errors.assignmentType ? 'error' : 'default'}
                  value={field.value}
                  onChange={(_event, value) => field.onChange(value)}
                >
                  {ASSIGNMENT_TYPE_OPTIONS.map((opt) => (
                    <FormSelectOption key={opt.value} value={opt.value} label={opt.label} />
                  ))}
                </FormSelect>
              )}
            />
          </FormGroup>

          <AssignmentFormFields
            assignmentType={assignmentType}
            projectOptions={projectOptions}
            userOptions={userOptions}
            roleOptions={roleOptions}
            isRoleDisabled={isProjectScoped && !selectedProjectId}
            errors={errors}
            control={control}
            register={register}
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" form="assign-role-form" type="submit" isLoading={isPending}>
          Add
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
