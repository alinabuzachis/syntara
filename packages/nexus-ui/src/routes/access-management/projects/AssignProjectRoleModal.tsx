import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core'
import { useEffect, useMemo, useState } from 'react'
import type { Control, FieldValues, Path } from 'react-hook-form'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useAlerts } from '../../../components/alerts'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { getErrorMessage } from '../../../utils/apiErrors'
import { accessClient } from '../../access/accessClient'
import { TypeaheadSelect } from '../../access/TypeaheadSelect'

const assignProjectRoleSchema = z.object({
  userId: z.string().min(1, 'User is required'),
  roleName: z.string().min(1, 'Role is required'),
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
}: Readonly<TypeaheadFormFieldProps<T>>) {
  return (
    <FormGroup label={label} fieldId={fieldId} isRequired>
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
              onChange={field.onChange}
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

type AssignProjectRoleModalProps = {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  assignedRolesByUser: Map<string, Set<string>>
}

export function AssignProjectRoleModal({
  projectId,
  isOpen,
  onClose,
  onSuccess,
  assignedRolesByUser,
}: Readonly<AssignProjectRoleModalProps>) {
  const { showSuccess, showError } = useAlerts()

  const { control, handleSubmit, reset, resetField, formState } = useForm<AssignProjectRoleFormData>({
    resolver: zodResolver(assignProjectRoleSchema, undefined, { mode: 'sync' }),
    defaultValues: { userId: '', roleName: '' },
  })

  useEffect(() => {
    if (isOpen) {
      reset({ userId: '', roleName: '' })
    }
  }, [isOpen, reset])

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

  const projectRolesQuery = accessClient.useQuery('get', '/projects/{project_id}/roles', {
    params: { path: { project_id: projectId }, query: { limit: 100 } },
  })
  const projectRoles = useMemo(() => projectRolesQuery.data?.resources ?? [], [projectRolesQuery.data])
  const rolesLoading = projectRolesQuery.isLoading

  const selectedUserId = useWatch({ control, name: 'userId' })

  useEffect(() => {
    resetField('roleName')
  }, [selectedUserId, resetField])

  const userOptions = useMemo(
    () => (usersQuery.data?.resources ?? []).map((u) => ({ value: u.id, label: u.username ?? u.id })),
    [usersQuery.data]
  )

  const roleOptions = useMemo(() => {
    const assignedForUser = selectedUserId ? assignedRolesByUser.get(selectedUserId) : undefined
    return projectRoles
      .filter((r) => !assignedForUser?.has(r.name))
      .map((r) => ({
        value: r.name,
        label: r.name,
        description: r.description ?? undefined,
      }))
  }, [projectRoles, selectedUserId, assignedRolesByUser])

  const { mutate: assignRole, isPending } = accessClient.useMutation('post', '/projects/{project_id}/role-assignments')

  const handleClose = () => {
    reset({ userId: '', roleName: '' })
    setUserSearchTerm('')
    onClose()
  }

  const onSubmit = handleSubmit((data) => {
    assignRole(
      {
        params: { path: { project_id: projectId } },
        body: { principal_type: 'user', principal_id: data.userId, role_name: data.roleName },
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

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="small">
      <ModalHeader title="Assign role" />
      <ModalBody>
        <Form id="assign-project-role-form" onSubmit={onSubmit}>
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
          />
          <TypeaheadFormField
            name="roleName"
            control={control}
            label="Role"
            fieldId="role-select"
            ariaLabel="Role"
            options={roleOptions}
            placeholder={rolesLoading ? 'Loading roles...' : 'Select a role...'}
            isDisabled={rolesLoading || !selectedUserId}
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
