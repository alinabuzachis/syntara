import {
  Button,
  Content,
  ContentVariants,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  List,
  ListItem,
} from '@patternfly/react-core'
import { PluggedIcon } from '@patternfly/react-icons'

import { ConfirmationDialog } from '../../../components/ConfirmationDialog'

import { AttachIdentityModal } from './AttachIdentityModal'
import type { UserIdentity } from './identityUtils'

function DetachConfirmModal({
  identity,
  isDetaching,
  onConfirm,
  onCancel,
}: Readonly<{
  identity: UserIdentity | null
  isDetaching: boolean
  onConfirm: () => void
  onCancel: () => void
}>) {
  return (
    <ConfirmationDialog
      isOpen={!!identity}
      onClose={onCancel}
      onConfirm={onConfirm}
      title="Disconnect identity?"
      confirmLabel="Disconnect"
      confirmVariant="danger"
      titleIconVariant="warning"
      confirmLoading={isDetaching}
    >
      Disconnecting will remove sign-in access for this identity. You will no longer be able to sign in with it.
      <DescriptionList isHorizontal isCompact style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
        <DescriptionListGroup>
          <DescriptionListTerm>Provider</DescriptionListTerm>
          <DescriptionListDescription>{identity?.provider_name}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Issuer</DescriptionListTerm>
          <DescriptionListDescription style={{ wordBreak: 'break-all' }}>{identity?.issuer}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Subject</DescriptionListTerm>
          <DescriptionListDescription style={{ wordBreak: 'break-all' }}>
            {identity?.subject}
          </DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>
    </ConfirmationDialog>
  )
}

export type ConvertProviderInfo = { name: string; authorizeUrl: string }

export function IdentityDialogs({
  isAttachOpen,
  onCloseAttach,
  currentUserId,
  onAttached,
  identityToDetach,
  isDetaching,
  onConfirmDetach,
  onCancelDetach,
  convertProvider,
  onCloseConvert,
  onConfirmConvert,
}: Readonly<{
  isAttachOpen: boolean
  onCloseAttach: () => void
  currentUserId: string
  onAttached: () => void
  identityToDetach: UserIdentity | null
  isDetaching: boolean
  onConfirmDetach: () => void
  onCancelDetach: () => void
  convertProvider: ConvertProviderInfo | null
  onCloseConvert: () => void
  onConfirmConvert: () => void
}>) {
  return (
    <>
      <AttachIdentityModal
        isOpen={isAttachOpen}
        onClose={onCloseAttach}
        currentUserId={currentUserId}
        onAttached={onAttached}
      />
      <DetachConfirmModal
        identity={identityToDetach}
        isDetaching={isDetaching}
        onConfirm={onConfirmDetach}
        onCancel={onCancelDetach}
      />
      <ConfirmationDialog
        isOpen={!!convertProvider}
        onClose={onCloseConvert}
        onConfirm={onConfirmConvert}
        title="Link identity provider?"
        confirmLabel="Convert and link"
        confirmVariant="danger"
        titleIconVariant="warning"
        destructiveAcknowledgement={{
          checkboxId: 'convert-to-federated-ack',
          label: 'I understand this action is irreversible',
        }}
      >
        <Content component="p">
          Linking to <strong>{convertProvider?.name}</strong> will permanently convert this account:
        </Content>
        <List>
          <ListItem>Your password will be permanently removed</ListItem>
          <ListItem>You will be signed out and must sign in via the identity provider</ListItem>
          <ListItem>This action cannot be undone</ListItem>
        </List>
      </ConfirmationDialog>
    </>
  )
}

export function ConnectAction({
  isSelf,
  isLocalUser,
  providerName,
  authorizeUrl,
  onConvert,
}: Readonly<{
  isSelf: boolean
  isLocalUser: boolean
  providerName: string
  authorizeUrl: string
  onConvert: (provider: ConvertProviderInfo) => void
}>) {
  if (!isSelf) {
    return (
      <Content component={ContentVariants.p} style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
        —
      </Content>
    )
  }

  if (isLocalUser) {
    return (
      <Button
        variant="secondary"
        size="sm"
        icon={<PluggedIcon />}
        onClick={() => onConvert({ name: providerName, authorizeUrl })}
      >
        Connect
      </Button>
    )
  }

  return (
    <Button variant="secondary" size="sm" icon={<PluggedIcon />} component="a" href={authorizeUrl}>
      Connect
    </Button>
  )
}
