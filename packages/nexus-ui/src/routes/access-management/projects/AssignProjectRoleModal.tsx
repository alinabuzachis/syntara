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
import { useMemo, useState } from 'react'
import type { Control, FieldValues, Path } from 'react-hook-form'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useAlerts } from '../../../components/alerts'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { getErrorMessage } from '../../../utils/apiErrors'
import { accessClient } from '../../access/accessClient'
import { TypeaheadSelect } from '../../access/TypeaheadSelect'
import { useAllProjectRoles } from '../../access/useAllProjectRoles'

const assignProjectRoleSchema = z
  .object({
    principalType: z.enum(['user', 'group']),
    userId: z.string(),
    groupId: z.string(),
    roleName: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.principalType === 'user' && !data.userId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'User is required', path: ['userId'] })
    }
    if (data.principalType === 'group' && !data.groupId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Group is required', path: ['groupId'] })
    }
    if (!data.roleName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Role is required', path: ['roleName'] })
    }
  })

type AssignProjectRoleFormData = z.infer<typeof assignProjectRoleSchema>

const PAGE_SIZE = 20

type TypeaheadFormFieldProps<T extends FieldValues> = {
  name: Path<T>
  control: Control<T>
  label: string
  fieldId: string
  ariaLabel: string
  options: { value: string; label: string; description?: string }[]
  placeholder: string
  isDisabled?: boolean
  onSearchChange?: (term: string) => void
  hasMore?: boolean
  isLoading?: boolean
  onValueChange?: () => void
}

function TypeaheadFormField<T extends FieldValues>({
  name,
  control,
  label,
  fieldId,
  ariaLabel,
  options,
  placeholder,
  isDisabled,
  onSearchChange,
  hasMore,
  isLoading,
  onValueChange,
}: Readonly<TypeaheadFormFieldProps<T>>) {
  return (
    <FormGroup label={label} fieldId={fieldId} isRequired role="group">
      <Controller
        name={name}
        control={control}
        render={({ field, fieldState }) => (
          <>
            <TypeaheadSelect
              id={fieldId}
              ariaLabel={ariaLabel}
              options={options}
              selected={field.value as string}
              onChange={(value) => {
                field.onChange(value)
                onValueChange?.()
              }}
              placeholder={placeholder}
              hasError={!!fieldState.error}
              isDisabled={isDisabled}
              onSearchChange={onSearchChange}
              hasMore={hasMore}
              isLoading={isLoading}
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
  )
}

const defaultValues: AssignProjectRoleFormData = { principalType: 'user', userId: '', groupId: '', roleName: '' }

type AssignProjectRoleModalProps = {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  assignedRolesByPrincipal: Map<string, Set<string>>
}

export function AssignProjectRoleModal({
  projectId,
  isOpen,
  onClose,
  onSuccess,
  assignedRolesByPrincipal,
}: Readonly<AssignProjectRoleModalProps>) {
  const { showSuccess, showError } = useAlerts()

  const { control, handleSubmit, reset, setValue, formState } = useForm<AssignProjectRoleFormData>({
    resolver: zodResolver(assignProjectRoleSchema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  const principalType = useWatch({ control, name: 'principalType' })
  const selectedUserId = useWatch({ control, name: 'userId' })
  const selectedGroupId = useWatch({ control, name: 'groupId' })
  const selectedPrincipalId = principalType === 'user' ? selectedUserId : selectedGroupId

  // ── Server-side user search ──────────────────────────────────────────────
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const debouncedUserSearch = useDebouncedValue(userSearchTerm)

  const usersQuery = accessClient.useQuery('get', '/users', {
    params: {
      query: {
        limit: PAGE_SIZE,
        ...(debouncedUserSearch ? { 'username[contains]': debouncedUserSearch } : {}),
      },
    },
  })

  // ── Server-side group search ─────────────────────────────────────────────
  const [groupSearchTerm, setGroupSearchTerm] = useState('')
  const debouncedGroupSearch = useDebouncedValue(groupSearchTerm)

  const groupsQuery = accessClient.useQuery('get', '/groups', {
    params: {
      query: {
        limit: PAGE_SIZE,
        ...(debouncedGroupSearch ? { 'name[contains]': debouncedGroupSearch } : {}),
      },
    },
  })

  const { roles: projectRoles, isLoading: rolesLoading } = useAllProjectRoles(projectId)

  const userOptions = useMemo(
    () => (usersQuery.data?.resources ?? []).map((u) => ({ value: u.id, label: u.username ?? u.id })),
    [usersQuery.data]
  )

  const groupOptions = useMemo(
    () =>
      (groupsQuery.data?.resources ?? [])
        .filter((g): g is typeof g & { id: string } => !!g.id)
        .map((g) => ({ value: g.id, label: g.name })),
    [groupsQuery.data]
  )

  const roleOptions = useMemo(() => {
    const assignedForPrincipal = selectedPrincipalId ? assignedRolesByPrincipal.get(selectedPrincipalId) : undefined
    return projectRoles
      .filter((r) => !assignedForPrincipal?.has(r.name))
      .map((r) => ({
        value: r.name,
        label: r.name,
        description: r.description ?? undefined,
      }))
  }, [projectRoles, selectedPrincipalId, assignedRolesByPrincipal])

  const { mutate: assignRole, isPending } = accessClient.useMutation('post', '/projects/{project_id}/role-assignments')

  const handleClose = () => {
    reset(defaultValues)
    setUserSearchTerm('')
    setGroupSearchTerm('')
    onClose()
  }

  const onSubmit = handleSubmit((data) => {
    const principalId = data.principalType === 'user' ? data.userId : data.groupId
    assignRole(
      {
        params: { path: { project_id: projectId } },
        body: { principal_type: data.principalType, principal_id: principalId, role_name: data.roleName },
      },
      {
        onSuccess: () => {
          showSuccess({ title: 'Role assigned', description: `Role "${data.roleName}" has been assigned.` })
          handleClose()
          onSuccess()
        },
        onError: (err: unknown) => {
          showError({ title: 'Failed to assign role', description: getErrorMessage(err) })
        },
      }
    )
  })

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="small">
      <ModalHeader title="Assign role" />
      <ModalBody>
        <Form id="assign-project-role-form" onSubmit={onSubmit}>
          <FormGroup label="Principal type" isRequired fieldId="principal-type" role="group">
            <Controller
              name="principalType"
              control={control}
              render={({ field }) => (
                <FormSelect
                  id="principal-type"
                  aria-label="Principal type"
                  value={field.value}
                  onChange={(_event, value) => {
                    field.onChange(value)
                    setValue('userId', '', { shouldValidate: false })
                    setValue('groupId', '', { shouldValidate: false })
                    setValue('roleName', '', { shouldValidate: false })
                  }}
                >
                  <FormSelectOption value="user" label="User" />
                  <FormSelectOption value="group" label="Group" />
                </FormSelect>
              )}
            />
          </FormGroup>

          {principalType === 'user' && (
            <TypeaheadFormField
              name="userId"
              control={control}
              label="User"
              fieldId="user-select"
              ariaLabel="User"
              options={userOptions}
              placeholder="Select a user..."
              onSearchChange={setUserSearchTerm}
              hasMore={!!usersQuery.data?.next}
              isLoading={usersQuery.isFetching}
              onValueChange={() => setValue('roleName', '', { shouldValidate: false })}
            />
          )}

          {principalType === 'group' && (
            <TypeaheadFormField
              name="groupId"
              control={control}
              label="Group"
              fieldId="group-select"
              ariaLabel="Group"
              options={groupOptions}
              placeholder="Select a group..."
              onSearchChange={setGroupSearchTerm}
              hasMore={!!groupsQuery.data?.next}
              isLoading={groupsQuery.isFetching}
              onValueChange={() => setValue('roleName', '', { shouldValidate: false })}
            />
          )}

          <TypeaheadFormField
            name="roleName"
            control={control}
            label="Role"
            fieldId="role-select"
            ariaLabel="Role"
            options={roleOptions}
            placeholder={rolesLoading ? 'Loading roles...' : 'Select a role...'}
            isDisabled={rolesLoading || !selectedPrincipalId}
          />
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
