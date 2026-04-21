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
import { getErrorMessage } from '../../utils/apiErrors'
import { accessClient } from '../access/accessClient'
import { useAllRoles } from '../access/useAllRoles'

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

interface AssignRoleModalProps {
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

  // Clear roles when scope changes (different role sets for system vs project)
  useEffect(() => {
    setValue('roleIds', [])
  }, [scope, setValue])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      reset({ scope: 'system', projectId: '', roleIds: [] })
    }
  }, [isOpen, reset])

  const { roles: allRoles } = useAllRoles()
  const projectsQuery = accessClient.useQuery('get', '/projects')

  const roleOptions = useMemo((): RoleOption[] => {
    if (scope === 'system') {
      return allRoles
        .filter((r) => r.project_id === null)
        .map((r) => ({ id: r.id, name: r.name, description: r.description ?? null }))
    }
    return allRoles
      .filter((r) => r.project_id === null && r.is_builtin && r.name.startsWith('project-'))
      .map((r) => ({ id: r.name, name: r.name, description: r.description ?? null }))
  }, [allRoles, scope])

  const projectOptions = useMemo(() => {
    return (projectsQuery.data ?? []).map((p) => ({ value: p.id, label: p.name }))
  }, [projectsQuery.data])

  const { mutateAsync: assignSystemUserRole } = accessClient.useMutation('post', '/user-role-assignments')
  const { mutateAsync: assignSystemGroupRole } = accessClient.useMutation('post', '/group-role-assignments')
  const { mutateAsync: assignProjectUserRole } = accessClient.useMutation('post', '/projects/{project_id}/roles')
  const { mutateAsync: assignProjectGroupRole } = accessClient.useMutation('post', '/projects/{project_id}/group-roles')

  const handleClose = () => {
    reset({ scope: 'system', projectId: '', roleIds: [] })
    onClose()
  }

  const onSubmit = handleSubmit(async (data) => {
    setIsPending(true)
    try {
      for (const roleKey of data.roleIds) {
        if (data.scope === 'system') {
          if (principalType === 'user') {
            await assignSystemUserRole({ body: { user_id: principalId, role_id: roleKey } })
          } else {
            await assignSystemGroupRole({ body: { group_id: principalId, role_id: roleKey } })
          }
        } else if (principalType === 'user') {
          await assignProjectUserRole({
            params: { path: { project_id: data.projectId } },
            body: { user_id: principalId, role_name: roleKey },
          })
        } else {
          await assignProjectGroupRole({
            params: { path: { project_id: data.projectId } },
            body: { group_id: principalId, role_name: roleKey },
          })
        }
      }
      const count = data.roleIds.length
      showAlert({
        title: count === 1 ? 'Role assigned' : `${String(count)} roles assigned`,
        variant: 'success',
        autoDismiss: true,
      })
      handleClose()
      onSuccess()
    } catch (err: unknown) {
      showAlert({
        title: 'Failed to assign roles',
        description: getErrorMessage(err),
        variant: 'error',
        autoDismiss: true,
      })
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
                <MultiRoleSelect options={roleOptions} selected={field.value} onChange={field.onChange} />
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
