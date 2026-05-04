import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Form,
  FormGroup,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectList,
  SelectOption,
} from '@patternfly/react-core'
import { type Ref, useEffect, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useAlerts } from '../../components/alerts'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getErrorMessage } from '../../utils/apiErrors'
import { accessClient } from '../access/accessClient'
import { useAllProjects } from '../access/useAllProjects'

import { MultiRoleSelect, type RoleOption } from './MultiRoleSelect'

const assignRoleSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('system'),
    projectId: z.string().optional(),
    roleIds: z.array(z.string()).min(1, 'Select at least one role'),
  }),
  z.object({
    scope: z.literal('project'),
    projectId: z.string().min(1, 'Project is required'),
    roleIds: z.array(z.string()).min(1, 'Select at least one role'),
  }),
])

type AssignRoleFormData = z.infer<typeof assignRoleSchema>

const ROLE_PAGE_SIZE = 20

type AssignRoleModalProps = {
  principalType: 'user' | 'group'
  principalId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

function SingleSelect({
  id,
  ariaLabel,
  value,
  onChange,
  options,
  placeholder,
}: Readonly<{
  id: string
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}>) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder ?? 'Select...'

  const toggle = (toggleRef: Ref<HTMLButtonElement>) => (
    <MenuToggle ref={toggleRef} onClick={() => setIsOpen(!isOpen)} isExpanded={isOpen} isFullWidth>
      {selectedLabel}
    </MenuToggle>
  )

  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={(_e, val) => {
        onChange(String(val))
        setIsOpen(false)
      }}
      selected={value}
      toggle={toggle}
    >
      <SelectList>
        {options.map((opt) => (
          <SelectOption key={opt.value} value={opt.value} isSelected={opt.value === value}>
            {opt.label}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  )
}

export function AssignRoleModal({
  principalType,
  principalId,
  isOpen,
  onClose,
  onSuccess,
}: Readonly<AssignRoleModalProps>) {
  const [isPending, setIsPending] = useState(false)
  const { showAlert } = useAlerts()

  const { control, handleSubmit, setValue, reset, formState } = useForm<AssignRoleFormData>({
    resolver: zodResolver(assignRoleSchema, undefined, { mode: 'sync' }),
    defaultValues: { scope: 'system', projectId: '', roleIds: [] },
  })

  const scope = useWatch({ control, name: 'scope' })

  useEffect(() => {
    setValue('roleIds', [])
  }, [scope, setValue])

  useEffect(() => {
    if (isOpen) {
      reset({ scope: 'system', projectId: '', roleIds: [] })
    }
  }, [isOpen, reset])

  const { projects: allProjects } = useAllProjects()

  // ── Server-side role search ──────────────────────────────────────────────
  const [roleSearch, setRoleSearch] = useState('')
  const debouncedRoleSearch = useDebouncedValue(roleSearch)

  const rolesQuery = accessClient.useQuery('get', '/roles', {
    params: {
      query: {
        limit: ROLE_PAGE_SIZE,
        ...(debouncedRoleSearch ? { 'name[contains]': debouncedRoleSearch } : {}),
        scope: scope === 'system' ? 'system' : 'project',
      },
    },
  })

  const roleOptions = useMemo((): RoleOption[] => {
    const roles = rolesQuery.data?.resources ?? []
    return roles.map((r) => ({ id: r.name, name: r.name, description: r.description ?? null }))
  }, [rolesQuery.data])

  const hasMoreRoles = !!rolesQuery.data?.next
  const isRolesLoading = rolesQuery.isFetching

  const handleRoleSearchChange = (term: string) => {
    setRoleSearch(term)
  }

  const projectOptions = useMemo(() => {
    return allProjects
      .filter((p): p is typeof p & { id: string } => !!p.id)
      .map((p) => ({ value: p.id, label: p.name }))
  }, [allProjects])

  const { mutateAsync: createRoleAssignment } = accessClient.useMutation('post', '/role-assignments')
  const { mutateAsync: createProjectRoleAssignment } = accessClient.useMutation(
    'post',
    '/projects/{project_id}/role-assignments'
  )

  const handleClose = () => {
    reset({ scope: 'system', projectId: '', roleIds: [] })
    setRoleSearch('')
    onClose()
  }

  const onSubmit = handleSubmit(async (data) => {
    setIsPending(true)
    try {
      const results = await Promise.allSettled(
        data.roleIds.map((roleKey) => {
          const body = { principal_type: principalType, principal_id: principalId, role_name: roleKey }
          if (data.scope === 'system') {
            return createRoleAssignment({ body })
          }
          return createProjectRoleAssignment({
            params: { path: { project_id: data.projectId } },
            body,
          })
        })
      )
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      const successCount = results.length - failures.length
      if (failures.length === 0) {
        showAlert({
          title: successCount === 1 ? 'Role assigned' : `${String(successCount)} roles assigned`,
          variant: 'success',
          autoDismiss: true,
        })
      } else if (successCount > 0) {
        showAlert({
          title: `${String(successCount)} role(s) assigned, ${String(failures.length)} failed`,
          description: getErrorMessage(failures[0].reason),
          variant: 'warning',
          autoDismiss: true,
        })
      } else {
        showAlert({
          title: 'Failed to assign roles',
          description: getErrorMessage(failures[0].reason),
          variant: 'error',
          autoDismiss: true,
        })
      }
      handleClose()
      onSuccess()
    } finally {
      setIsPending(false)
    }
  })

  const roleIds = useWatch({ control, name: 'roleIds' })

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="medium">
      <ModalHeader title="Assign roles" />
      <ModalBody>
        <Form id="assign-role-form" onSubmit={onSubmit}>
          <FormGroup label="Scope" fieldId="scope-select" isRequired>
            <Controller
              name="scope"
              control={control}
              render={({ field }) => (
                <SingleSelect
                  id="scope-select"
                  ariaLabel="Scope"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'project', label: 'Project' },
                  ]}
                />
              )}
            />
          </FormGroup>
          {scope === 'project' && (
            <FormGroup label="Project" fieldId="project-select" isRequired>
              <Controller
                name="projectId"
                control={control}
                render={({ field }) => (
                  <SingleSelect
                    id="project-select"
                    ariaLabel="Project"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    options={projectOptions}
                    placeholder="Select a project..."
                  />
                )}
              />
            </FormGroup>
          )}
          <FormGroup label="Roles" fieldId="multi-role-select" isRequired>
            <Controller
              name="roleIds"
              control={control}
              render={({ field }) => (
                <MultiRoleSelect
                  options={roleOptions}
                  selected={field.value}
                  onChange={field.onChange}
                  onSearchChange={handleRoleSearchChange}
                  hasMore={hasMoreRoles}
                  isLoading={isRolesLoading}
                />
              )}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="assign-role-form"
          isDisabled={!formState.isValid || isPending}
          isLoading={isPending}
        >
          Assign {roleIds.length > 0 ? `(${String(roleIds.length)})` : ''}
        </Button>
        <Button variant="link" onClick={handleClose} isDisabled={isPending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
