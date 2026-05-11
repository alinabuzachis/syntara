import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, FlexItem, Form, Stack, StackItem } from '@patternfly/react-core'
import { RhUiAddIcon } from '@patternfly/react-icons'
import type { BaseSyntheticEvent, ReactNode } from 'react'
import type { Control } from 'react-hook-form'
import { useForm, useWatch } from 'react-hook-form'
import { navigate } from 'wouter/use-browser-location'

import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsCreateUser, breadcrumbsEditUser, breadcrumbsUserFormLoading } from '../../../app/breadcrumbBuilders'
import type { AppBreadcrumbItem } from '../../../app/breadcrumbs/appBreadcrumbItem'
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

function PasswordWarningAlert({ isSelf }: Readonly<{ isSelf: boolean }>) {
  const title = isSelf ? 'You will be signed out' : 'User will be signed out'
  const description = isSelf
    ? 'Changing your own password will end all active sessions. You will need to sign in again with your new password.'
    : "Changing this user's password will revoke all their active sessions. They will need to sign in again."
  return (
    <StackItem>
      <Alert variant="warning" title={title} isInline>
        {description}
      </Alert>
    </StackItem>
  )
}

function UserFormWarningAlerts({
  showDisableWarning,
  showPasswordWarning,
  isSelf,
}: Readonly<{ showDisableWarning: boolean; showPasswordWarning: boolean; isSelf: boolean }>) {
  return (
    <>
      {showDisableWarning ? (
        <StackItem>
          <Alert variant="warning" title="You will be signed out" isInline>
            Disabling your own account will immediately end your current session. You will need another admin to
            re-enable it.
          </Alert>
        </StackItem>
      ) : null}
      {showPasswordWarning ? <PasswordWarningAlert isSelf={isSelf} /> : null}
    </>
  )
}

function userFormBreadcrumbTrail(
  isEdit: boolean,
  pageTitle: string,
  userId: string | undefined,
  user: { full_name: string | null; username: string } | undefined
): AppBreadcrumbItem[] {
  if (!isEdit) {
    return breadcrumbsCreateUser()
  }
  const userBasePath = userId ? AppRoute.AccessManagement.UserDetail.replace(':userId', userId) : undefined
  const displayName = user ? (user.full_name ?? user.username) : undefined
  if (displayName && userBasePath) {
    return breadcrumbsEditUser(displayName, userBasePath)
  }
  return breadcrumbsUserFormLoading(pageTitle)
}

function UserFormHeaderActions({
  isEdit,
  isSaving,
  submitLabel,
  onCancel,
}: Readonly<{ isEdit: boolean; isSaving: boolean; submitLabel: string; onCancel: () => void }>) {
  return (
    <>
      <FlexItem grow={{ default: 'grow' }} />
      <Button variant="link" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="user-form"
        isLoading={isSaving}
        isDisabled={isSaving}
        icon={isEdit ? undefined : <RhUiAddIcon />}
      >
        {submitLabel}
      </Button>
    </>
  )
}

type UserFormMainPanelProps = {
  control: Control<UserFormData>
  isEdit: boolean
  isBuiltinUser: boolean
  isFederatedUser: boolean
  isSelf: boolean
  statusToggleDisabledReason?: string
  showDisableWarning: boolean
  showPasswordWarning: boolean
  onFormSubmit: (event?: BaseSyntheticEvent) => Promise<void>
}

function UserFormMainPanel({
  control,
  isEdit,
  isBuiltinUser,
  isFederatedUser,
  isSelf,
  statusToggleDisabledReason,
  showDisableWarning,
  showPasswordWarning,
  onFormSubmit,
}: Readonly<UserFormMainPanelProps>) {
  return (
    <AppPanel isFullHeight panelMainBodyProps={{ style: { padding: 'var(--pf-t--global--spacer--xl)' } }}>
      <Stack hasGutter style={{ maxWidth: '600px' }}>
        <UserFormWarningAlerts
          showDisableWarning={showDisableWarning}
          showPasswordWarning={showPasswordWarning}
          isSelf={isSelf}
        />
        <StackItem>
          <Form id="user-form" onSubmit={onFormSubmit}>
            <UserFormFields
              control={control}
              isEdit={isEdit}
              isBuiltinUser={isBuiltinUser}
              isBuiltinSelf={isBuiltinUser && isSelf}
              isFederatedUser={isFederatedUser}
              statusToggleDisabledReason={statusToggleDisabledReason}
            />
          </Form>
        </StackItem>
      </Stack>
    </AppPanel>
  )
}

function UserFormEditNotFoundPage({ onBack, onRetry }: Readonly<{ onBack: () => void; onRetry: () => void }>) {
  return (
    <AppPage>
      <AppPageHeader title="Edit User" breadcrumbs={breadcrumbsUserFormLoading('Edit user')} />
      <AppPageMain>
        <AppPanel isFullHeight>
          <UserNotFoundState onBack={onBack} onRetry={onRetry} />
        </AppPanel>
      </AppPageMain>
    </AppPage>
  )
}

function UserFormEditBusyPage({ pageTitle, children }: Readonly<{ pageTitle: string; children: ReactNode }>) {
  return (
    <AppPage>
      <AppPageHeader title={pageTitle} breadcrumbs={breadcrumbsUserFormLoading(pageTitle)} />
      <AppPageMain>
        <AppPanel isFullHeight>{children}</AppPanel>
      </AppPageMain>
    </AppPage>
  )
}

export function UserForm({ mode }: Readonly<UserFormProps>) {
  const isEdit = mode === 'edit'
  const pageTitle = isEdit ? 'Edit User' : 'Create User'
  const submitLabel = isEdit ? 'Save' : 'Create user'

  const {
    userId,
    isValidId,
    userQuery,
    isBuiltinUser,
    isFederatedUser,
    isSelf,
    statusToggleDisabledReason,
    formValues,
  } = useUserFormData(isEdit)

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
    isFederatedUser,
    isSelf,
    setError,
    navigateBack,
  })

  const passwordValue = useWatch({ control, name: 'password' })
  const isActiveValue = useWatch({ control, name: 'is_enabled' })
  const showPasswordWarning = isEdit && !isFederatedUser && !!passwordValue
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
      <UserFormEditNotFoundPage
        onBack={navigateBack}
        onRetry={() => {
          detachPromise(refetchUser())
        }}
      />
    )
  }
  if (isEdit && queryState) {
    return <UserFormEditBusyPage pageTitle={pageTitle}>{queryState}</UserFormEditBusyPage>
  }

  const formBreadcrumbs = userFormBreadcrumbTrail(isEdit, pageTitle, userId, userQuery.data)

  return (
    <AppPage>
      <AppPageHeader title={pageTitle} breadcrumbs={formBreadcrumbs}>
        <UserFormHeaderActions isEdit={isEdit} isSaving={isSaving} submitLabel={submitLabel} onCancel={navigateBack} />
      </AppPageHeader>
      <AppPageMain>
        <UserFormMainPanel
          control={control}
          isEdit={isEdit}
          isBuiltinUser={isBuiltinUser}
          isFederatedUser={isFederatedUser}
          isSelf={isSelf}
          statusToggleDisabledReason={statusToggleDisabledReason}
          showDisableWarning={showDisableWarning}
          showPasswordWarning={showPasswordWarning}
          onFormSubmit={handleSubmit(onSubmit)}
        />
      </AppPageMain>
    </AppPage>
  )
}
