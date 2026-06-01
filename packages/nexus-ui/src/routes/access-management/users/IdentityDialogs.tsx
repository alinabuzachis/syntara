import {
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Dropdown,
  DropdownItem,
  DropdownList,
  List,
  ListItem,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { RhUiEllipsisVerticalFillIcon, RhUiLinkBrokenIcon, RhUiLinkIcon } from '@patternfly/react-icons'
import { useState } from 'react'

import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'

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
    <NxConfirmationDialog
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
    </NxConfirmationDialog>
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
      <NxConfirmationDialog
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
      </NxConfirmationDialog>
    </>
  )
}

type ConnectedKebabProps = {
  kind: 'connected'
  isLastIdentity: boolean
  isDetaching: boolean
  onDisconnect: () => void
}

type DisconnectedKebabProps = {
  kind: 'disconnected'
  isSelf: boolean
  isLocalUser: boolean
  providerName: string
  authorizeUrl: string
  onConvert: (info: ConvertProviderInfo) => void
}

export type IdentityKebabProps = ConnectedKebabProps | DisconnectedKebabProps

function IdentityKebabToggle({
  toggleRef,
  onClick,
  isExpanded,
}: Readonly<{
  toggleRef: React.Ref<MenuToggleElement>
  onClick: () => void
  isExpanded: boolean
}>) {
  return (
    <MenuToggle ref={toggleRef} variant="plain" onClick={onClick} isExpanded={isExpanded} aria-label="Identity actions">
      <RhUiEllipsisVerticalFillIcon />
    </MenuToggle>
  )
}

export function IdentityActionsKebab(props: Readonly<IdentityKebabProps>) {
  const [isOpen, setIsOpen] = useState(false)

  let actionItem: React.ReactNode

  if (props.kind === 'connected') {
    const { isLastIdentity, isDetaching, onDisconnect } = props
    actionItem = (
      <DropdownItem
        isDanger
        icon={<RhUiLinkBrokenIcon />}
        isAriaDisabled={isLastIdentity || isDetaching}
        tooltipProps={isLastIdentity ? { content: 'Cannot disconnect the only sign-in method' } : undefined}
        onClick={() => {
          onDisconnect()
          setIsOpen(false)
        }}
      >
        Disconnect
      </DropdownItem>
    )
  } else {
    const { isSelf, isLocalUser, providerName, authorizeUrl, onConvert } = props
    const handleConnect = () => {
      if (isLocalUser) {
        onConvert({ name: providerName, authorizeUrl })
      } else {
        globalThis.location.href = authorizeUrl
      }
      setIsOpen(false)
    }
    actionItem = (
      <DropdownItem
        icon={<RhUiLinkIcon />}
        isAriaDisabled={!isSelf}
        tooltipProps={!isSelf ? { content: 'Only the user can connect their own identity' } : undefined}
        onClick={isSelf ? handleConnect : undefined}
      >
        Connect
      </DropdownItem>
    )
  }

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      toggle={(toggleRef) => (
        <IdentityKebabToggle toggleRef={toggleRef} onClick={() => setIsOpen((o) => !o)} isExpanded={isOpen} />
      )}
      popperProps={{ position: 'right' }}
    >
      <DropdownList>{actionItem}</DropdownList>
    </Dropdown>
  )
}
