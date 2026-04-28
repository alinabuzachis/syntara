import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, FlexItem, Form, Stack, StackItem } from '@patternfly/react-core'
import { useForm, useWatch } from 'react-hook-form'
import { navigate } from 'wouter/use-browser-location'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { AppPanel } from '../../../components/AppPanel'
import { useQueryState } from '../../../components/states/useQueryState'
import { detachPromise } from '../../../utils/detachPromise'
import { userFormSchema, userCreateSchema, type UserFormData } from '../userFormSchema'

import { UserFormFields } from './UserFormFields'
import { UserNotFoundState } from './UserNotFoundState'
import { useUserFormData } from './useUserFormData'
import { useUserFormSubmit } from './useUserFormSubmit'

type UserFormProps = {
  mode: 'create' | 'edit'
}

const DEFAULT_VALUES: UserFormData = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  is_enabled: true,
}

export function UserForm({ mode }: Readonly<UserFormProps>) {
  const isEdit = mode === 'edit'
  const pageTitle = isEdit ? 'Edit User' : 'Create User'
  const submitLabel = isEdit ? 'Save' : 'Create'

  const { userId, isValidId, userQuery, isBuiltinUser, isSelf, statusToggleDisabledReason, formValues } =
    useUserFormData(isEdit)

  const schema = isEdit ? userFormSchema : userCreateSchema
  const { control, handleSubmit, setError } = useForm<UserFormData>({
    resolver: zodResolver(schema, undefined, { mode: 'sync' }),
    defaultValues: formValues ?? DEFAULT_VALUES,
    values: isEdit && formValues ? formValues : undefined,
  })

  const navigateBack = () => navigate(AppRoute.AccessManagement.Users)

  const { onSubmit, isSaving } = useUserFormSubmit({
    isEdit,
    isValidId,
    userId,
    isBuiltinUser,
    isSelf,
    setError,
    navigateBack,
  })

  const passwordValue = useWatch({ control, name: 'password' })
  const isActiveValue = useWatch({ control, name: 'is_enabled' })
  const showPasswordWarning = isEdit && !!passwordValue
  const showDisableWarning = isEdit && isSelf && isActiveValue === false

  const refetchUser = userQuery.refetch
  const queryState = useQueryState(userQuery, {
    title: 'Error loading user',
    onRetry: () => {
      detachPromise(refetchUser())
    },
  })
  if (isEdit && userQuery.error) {
    return (
      <AppPage>
        <AppPageHeader title="Edit User" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <AppPanel isFullHeight>
            <UserNotFoundState
              onBack={navigateBack}
              onRetry={() => {
                detachPromise(refetchUser())
              }}
            />
          </AppPanel>
        </StackItem>
      </AppPage>
    )
  }
  if (isEdit && queryState) {
    return (
      <AppPage>
        <AppPageHeader title={pageTitle} />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title={pageTitle}>
        <FlexItem grow={{ default: 'grow' }} />
        <Button variant="link" onClick={navigateBack}>
          Cancel
        </Button>
        <Button type="submit" form="user-form" isLoading={isSaving} isDisabled={isSaving}>
          {submitLabel}
        </Button>
      </AppPageHeader>
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <AppPanel isFullHeight panelMainBodyProps={{ style: { padding: 'var(--pf-t--global--spacer--xl)' } }}>
          <Stack hasGutter style={{ maxWidth: '600px' }}>
            {showDisableWarning && (
              <StackItem>
                <Alert variant="warning" title="You will be signed out" isInline>
                  Disabling your own account will immediately end your current session. You will need another admin to
                  re-enable it.
                </Alert>
              </StackItem>
            )}
            {showPasswordWarning && (
              <StackItem>
                <Alert variant="warning" title={isSelf ? 'You will be signed out' : 'User will be signed out'} isInline>
                  {isSelf
                    ? 'Changing your own password will end all active sessions. You will need to sign in again with your new password.'
                    : "Changing this user's password will revoke all their active sessions. They will need to sign in again."}
                </Alert>
              </StackItem>
            )}
            <StackItem>
              <Form id="user-form" onSubmit={handleSubmit(onSubmit)}>
                <UserFormFields
                  control={control}
                  isEdit={isEdit}
                  isBuiltinUser={isBuiltinUser}
                  isBuiltinSelf={isBuiltinUser && isSelf}
                  statusToggleDisabledReason={statusToggleDisabledReason}
                />
              </Form>
            </StackItem>
          </Stack>
        </AppPanel>
      </StackItem>
    </AppPage>
  )
}
